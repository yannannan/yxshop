import { env } from '@/db/mysql-runtime';
import { listSigningStamps } from './signature-stamps';
import { consumePoints, lockPointsUser, pointsBalance, type PointsDatabase } from './points-service';
import { validPoints } from './points';
import { modulePrices } from './tool-module-pricing';
import { getToolEntitlement, usableToolOrder, type ToolOrderAccess } from './tool-entitlements';
import {
  SignatureError, signatureApi, signatureLimits, signatureToolSlug,
  type SavedSignature, type SignatureAccess, type SignatureAction, type SignatureQuote, type SignedDocument,
} from './signature-tool';
import type { SignatureObject } from './signature-oss.mjs';
import { ensureToolResultDeletions, resultDeletedAt, visibleToolResults } from './tool-result-deletion';

type Tool = { id: number; tool_charge_type: string; tool_points_cost: number };
type Task = { id: string; product_id: number; request_hash: string };
type SignatureRow = Task & {
  name: string; image_width: number; image_height: number; points_spent: number; deleted_at: string | null;
  created_at?: string;
};
type LibraryKind = 'signature' | 'handprint';
const libraryTable = (kind: LibraryKind) => kind === 'handprint' ? 'document_handprints' : 'document_signatures';
type DocumentRow = Task & {
  file_name: string; file_bytes: number; points_spent: number; expires_at: string; storage_json: string;
  result_deleted_at?: string | null;
};
type Operation = { userId: number; toolId: number; id: string; hash: string; quote: SignatureQuote };

const signatureColumns = 'id,product_id,request_hash,name,image_width,image_height,points_spent,deleted_at,created_at';
const documentColumns = `id,product_id,request_hash,file_name,file_bytes,points_spent,expires_at,storage_json,${resultDeletedAt('signed-document')} AS result_deleted_at`;

export function publicSignature(row: SignatureRow, kind: LibraryKind = 'signature'): SavedSignature {
  return {
    id: row.id, name: row.name, width: Number(row.image_width), height: Number(row.image_height),
    pointsSpent: Number(row.points_spent), previewUrl: `${signatureApi}/${row.id}?kind=${kind}`,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
  };
}

export function publicDocument(row: DocumentRow): SignedDocument {
  return {
    id: row.id, name: row.file_name, bytes: Number(row.file_bytes), pointsSpent: Number(row.points_spent),
    expiresAt: row.expires_at, downloadUrl: `${signatureApi}/${row.id}`,
  };
}

async function readTool(db: PointsDatabase, lock = false) {
  const tool = await db.prepare(`SELECT id,tool_charge_type,tool_points_cost FROM products
    WHERE tool_slug=? AND product_type='tool' AND status='active'${lock ? ' FOR UPDATE' : ''}`)
    .bind(signatureToolSlug).first<Tool>();
  if (!tool) throw new SignatureError('文件签名工具不存在或已停用', 404);
  if (!['free', 'paid', 'points', 'pending'].includes(tool.tool_charge_type)) {
    throw new SignatureError('工具收费配置异常', 409);
  }
  return tool;
}

export function getSignatureTool() {
  return readTool(env.DB);
}

async function costsFor(db: PointsDatabase, tool: Tool, lock = false) {
  if (tool.tool_charge_type !== 'points') return { create: 0, sign: 0, handprint: 0 };
  const prices = await modulePrices(db, Number(tool.id), signatureToolSlug, lock);
  const costs = { create: prices.create ?? Number(tool.tool_points_cost), sign: prices.sign ?? Number(tool.tool_points_cost),
    handprint: prices.handprint ?? Number(tool.tool_points_cost) };
  if (!Object.values(costs).every(validPoints)) throw new SignatureError('工具积分消耗尚未正确配置', 409);
  return costs;
}

export async function getSignatureAccess(tool: Tool, userId: number | null, readiness: {
  storageReady: boolean; wordReady: boolean;
}): Promise<SignatureAccess> {
  if (userId) await ensureToolResultDeletions('signed-document');
  const [costs, balance, order, signatures, stamps, documents, handprintLibrary] = await Promise.all([
    costsFor(env.DB, tool),
    userId ? pointsBalance(userId) : 0,
    userId && ['paid', 'points'].includes(tool.tool_charge_type) ? getToolEntitlement(userId, tool.id) : null,
    userId ? env.DB.prepare(`SELECT ${signatureColumns} FROM document_signatures WHERE user_id=? AND product_id=?
      AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 30`).bind(userId, tool.id).all<SignatureRow>() : null,
    userId ? listSigningStamps(userId) : [],
    userId ? env.DB.prepare(`SELECT ${documentColumns} FROM signed_documents WHERE user_id=? AND product_id=?
      AND expires_at>? AND ${visibleToolResults('signed-document')} ORDER BY created_at DESC,id DESC LIMIT 10`)
      .bind(userId, tool.id, new Date().toISOString()).all<DocumentRow>() : null,
    userId ? env.DB.prepare(`SELECT ${signatureColumns} FROM document_handprints WHERE user_id=? AND product_id=?
      AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 30`).bind(userId, tool.id).all<SignatureRow>()
      .then(rows => ({ ready: true, rows: rows.results })).catch(error => {
        if (error?.code === 'ER_NO_SUCH_TABLE') return { ready: false, rows: [] as SignatureRow[] };
        throw error;
      }) : { ready: true, rows: [] as SignatureRow[] },
  ]);
  return {
    signedIn: Boolean(userId), chargeType: tool.tool_charge_type, pointsBalance: balance,
    hasMembership: Boolean(order), costs, ...readiness,
    canProcess: Boolean(userId) && tool.tool_charge_type !== 'pending' && (tool.tool_charge_type !== 'paid' || Boolean(order)),
    signatures: signatures?.results.map(row => publicSignature(row)) ?? [],
    stamps,
    handprints: handprintLibrary.rows.map(row => publicSignature(row, 'handprint')),
    handprintReady: handprintLibrary.ready,
    documents: documents?.results.map(publicDocument) ?? [],
  };
}

function assertQuote(tool: Tool, costs: Record<SignatureAction, number>, action: SignatureAction, quote: SignatureQuote) {
  if (tool.tool_charge_type === 'pending') throw new SignatureError('该工具的收费方式尚未确认', 409);
  if (tool.tool_charge_type !== quote.chargeType || costs[action] !== quote.cost) {
    throw new SignatureError('积分价格已变化，请刷新后重新处理', 409);
  }
}

export async function checkSignatureAccess(tool: Tool, userId: number, action: SignatureAction, quote: SignatureQuote) {
  assertQuote(tool, await costsFor(env.DB, tool), action, quote);
  if (tool.tool_charge_type === 'free') return;
  if (await getToolEntitlement(userId, tool.id)) return;
  if (tool.tool_charge_type === 'paid') throw new SignatureError('暂无有效套餐，请购买后处理', 402);
  if (await pointsBalance(userId) < quote.cost) throw new SignatureError('积分不足，请充值后再试', 402);
}

function assertSameTask(row: Task, operation: Operation) {
  if (Number(row.product_id) !== Number(operation.toolId) || row.request_hash !== operation.hash) {
    throw new SignatureError('任务内容已变化，请重新提交', 409);
  }
}

export async function findCreatedSignature(operation: Operation, db = env.DB as PointsDatabase, kind: LibraryKind = 'signature') {
  const row = await db.prepare(`SELECT ${signatureColumns} FROM ${libraryTable(kind)} WHERE user_id=? AND id=?`)
    .bind(operation.userId, operation.id).first<SignatureRow>();
  if (!row) return null;
  assertSameTask(row, operation);
  if (row.deleted_at) throw new SignatureError(kind === 'handprint' ? '该手印已删除' : '该签名已删除', 410);
  return publicSignature(row, kind);
}

export async function findSignedDocument(userId: number, id: string, db = env.DB as PointsDatabase) {
  await ensureToolResultDeletions('signed-document');
  const row = await db.prepare(`SELECT ${documentColumns} FROM signed_documents WHERE user_id=? AND id=?`)
    .bind(userId, id).first<DocumentRow>();
  if (row?.result_deleted_at) throw new SignatureError('该制作成品已删除，请重新制作', 410);
  return row;
}

export function reconcileSignedDocument(userId: number, id: string) {
  return env.DB.transaction(async db => {
    await lockPointsUser(db, userId);
    return findSignedDocument(userId, id, db);
  });
}

export function reuseSignedDocument(row: DocumentRow, operation: Operation) {
  assertSameTask(row, operation);
  if (row.expires_at <= new Date().toISOString()) throw new SignatureError('签署文件已过期，请重新生成', 410);
  return publicDocument(row);
}

export function readSignatureImage(userId: number, id: string, kind: LibraryKind = 'signature') {
  return env.DB.prepare(`SELECT png,image_width,image_height FROM ${libraryTable(kind)} WHERE user_id=? AND id=? AND deleted_at IS NULL`)
    .bind(userId, id).first<{ png: Buffer; image_width: number; image_height: number }>();
}

export async function deleteSignature(userId: number, id: string, kind: LibraryKind = 'signature') {
  await env.DB.prepare(`UPDATE ${libraryTable(kind)} SET deleted_at=?,png=NULL WHERE user_id=? AND id=? AND deleted_at IS NULL`)
    .bind(new Date().toISOString(), userId, id).run();
}

async function settle(db: PointsDatabase, operation: Operation, action: SignatureAction) {
  const { userId, toolId, quote } = operation;
  const tool = await readTool(db, true);
  if (Number(tool.id) !== Number(toolId)) throw new SignatureError('工具配置已变化，请刷新页面后重试', 409);
  assertQuote(tool, await costsFor(db, tool, true), action, quote);
  if (tool.tool_charge_type === 'free') return 0;

  const { results } = await db.prepare(`SELECT id,tool_billing_cycle,tool_paid_at,tool_uses_remaining FROM orders
    WHERE user_id=? AND product_id=? AND status IN ('paid','pending_delivery','delivered') ORDER BY created_at,id FOR UPDATE`)
    .bind(userId, toolId).all<ToolOrderAccess>();
  const order = results.filter(item => usableToolOrder(item))
    .sort((a, b) => Number(a.tool_billing_cycle === 'times') - Number(b.tool_billing_cycle === 'times'))[0];
  const operationId = `signature:${action}:${userId}:${operation.id}`;
  if (order) {
    if (order.tool_billing_cycle === 'times') {
      await db.prepare('UPDATE orders SET tool_uses_remaining=tool_uses_remaining-1 WHERE id=? AND user_id=? AND tool_uses_remaining>0')
        .bind(order.id, userId).expectChanges(1).run();
    }
    await db.prepare('INSERT INTO tool_usage_events (operation_id,order_id,created_at) VALUES (?,?,?)')
      .bind(operationId, order.id, new Date().toISOString()).run();
    return 0;
  }
  if (tool.tool_charge_type === 'paid') throw new SignatureError('暂无有效套餐，请购买后处理', 402);
  return (await consumePoints(db, userId, toolId, quote.cost, operationId)).pointsSpent;
}

export async function saveCreatedSignature(operation: Operation, image: {
  name: string; png: Buffer; width: number; height: number;
}, kind: LibraryKind = 'signature') {
  return env.DB.transaction(async db => {
    await lockPointsUser(db, operation.userId);
    const previous = await findCreatedSignature(operation, db, kind);
    if (previous) return previous;
    const count = await db.prepare(`SELECT COUNT(*) AS total FROM ${libraryTable(kind)} WHERE user_id=? AND deleted_at IS NULL`)
      .bind(operation.userId).first<{ total: number }>();
    if (Number(count?.total) >= signatureLimits.savedSignatures) throw new SignatureError(kind === 'handprint' ? '手印库已满，请先删除不用的手印' : '签名库已满，请先删除不用的签名', 409);
    const points = await settle(db, operation, kind === 'handprint' ? 'handprint' : 'create');
    const createdAt = new Date().toISOString();
    await db.prepare(`INSERT INTO ${libraryTable(kind)}
      (user_id,id,product_id,request_hash,name,png,image_width,image_height,points_spent,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(operation.userId, operation.id, operation.toolId, operation.hash, image.name, image.png,
        image.width, image.height, points, createdAt).run();
    return publicSignature({
      id: operation.id, product_id: operation.toolId, request_hash: operation.hash, name: image.name,
      image_width: image.width, image_height: image.height, points_spent: points, deleted_at: null, created_at: createdAt,
    }, kind);
  });
}

export async function saveSignedDocument(operation: Operation, name: string, object: SignatureObject) {
  await ensureToolResultDeletions('signed-document');
  return env.DB.transaction(async db => {
    await lockPointsUser(db, operation.userId);
    const previous = await findSignedDocument(operation.userId, operation.id, db);
    if (previous) return { document: reuseSignedDocument(previous, operation), reused: true };
    const points = await settle(db, operation, 'sign');
    const now = new Date();
    const row: DocumentRow = {
      id: operation.id, product_id: operation.toolId, request_hash: operation.hash, file_name: name,
      file_bytes: object.size, points_spent: points, storage_json: JSON.stringify(object),
      expires_at: new Date(now.getTime() + signatureLimits.retentionDays * 86400000).toISOString(),
    };
    await db.prepare(`INSERT INTO signed_documents
      (user_id,id,product_id,request_hash,file_name,file_bytes,points_spent,created_at,expires_at,storage_json) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(operation.userId, row.id, row.product_id, row.request_hash, row.file_name, row.file_bytes,
        row.points_spent, now.toISOString(), row.expires_at, row.storage_json).run();
    return { document: publicDocument(row), reused: false };
  });
}
