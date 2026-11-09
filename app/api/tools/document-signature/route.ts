import { createHash } from 'node:crypto';
import { boundedImageForm, requireImageOrigin } from '@/lib/image-request';
import { pointsUser } from '@/lib/points-service';
import { readSignatureRaster, signImage, signPdf, trimSignature } from '@/lib/signature-render';
import { signatureStorage } from '@/lib/signature-oss.mjs';
import { convertSignatureWord, signatureWordReady } from '@/lib/signature-word.mjs';
import {
  checkSignatureAccess, findCreatedSignature, findSignedDocument, getSignatureAccess, getSignatureTool,
  readSignatureImage, reconcileSignedDocument, reuseSignedDocument, saveCreatedSignature, saveSignedDocument,
} from '@/lib/signature-service';
import { isSignatureId, parseSignaturePlacements, SignatureError, signatureLimits, signatureName, signingAssetKey } from '@/lib/signature-tool';
import { findStampTool } from '@/lib/stamp-service';
import { readSigningStamp } from '@/lib/signature-stamps';
import { signatureFailure, signatureHeaders } from '@/lib/signature-response';

export const runtime = 'nodejs';
let running = 0;

export async function GET(request: Request) {
  try {
    const user = await pointsUser(request);
    return Response.json(await getSignatureAccess(await getSignatureTool(), user?.id ?? null, {
      storageReady: signatureStorage.ready(), wordReady: await signatureWordReady(),
    }), { headers: signatureHeaders });
  } catch (error) {
    return signatureFailure(error);
  }
}

export async function POST(request: Request) {
  let acquired = false;
  try {
    requireImageOrigin(request);
    const user = await pointsUser(request);
    if (!user) throw new SignatureError('请登录后使用文件签名', 401);
    if (running >= 2) throw new SignatureError('文件签名服务繁忙，请稍后重试', 429);
    running++;
    acquired = true;

    const form = await boundedImageForm(request, signatureLimits.fileBytes + 64 * 1024);
    const metadata = form.get('metadata');
    const file = form.get('file');
    if (typeof metadata !== 'string' || metadata.length > 12_000 || !file || typeof file === 'string' || !file.size) {
      throw new SignatureError('签名请求参数不正确');
    }
    if (file.size > signatureLimits.fileBytes) throw new SignatureError('上传文件不得超过12MB', 413);
    const input = JSON.parse(metadata);
    if (!input || typeof input !== 'object') throw new SignatureError('签名请求参数不正确');
    const tool = await getSignatureTool();
    const bytes = Buffer.from(await file.arrayBuffer());

    if (input.action === 'word-preview') {
      if (!(await signatureWordReady())) throw new SignatureError('当前环境暂未启用 DOCX，请先将 Word 另存为 PDF 后上传', 503);
      if (tool.tool_charge_type === 'pending') throw new SignatureError('该工具的收费方式尚未确认', 409);
      try {
        const pdf = await convertSignatureWord(bytes, request.signal);
        return new Response(new Uint8Array(pdf), { headers: { ...signatureHeaders, 'Content-Type': 'application/pdf' } });
      } catch (error) {
        throw new SignatureError((error as Error).message);
      }
    }

    if (!isSignatureId(input.id) || !['create', 'sign'].includes(input.action) ||
      !['points', 'paid', 'free'].includes(input.chargeType) || !Number.isSafeInteger(input.cost) || input.cost < 0) {
      throw new SignatureError('签名请求参数不正确');
    }
    const name = signatureName(input.name, input.action === 'create' ? 48 : 100);
    if (!name) throw new SignatureError(input.action === 'create' ? '请输入签名名称' : '请输入文件名称');
    const quote = { chargeType: input.chargeType, cost: input.cost };
    const identity = { userId: user.id, toolId: tool.id, id: input.id, quote };
    if (input.action === 'create') {
      const raster = readSignatureRaster(bytes, input.width, input.height, signatureLimits.signaturePixels);
      const hash = createHash('sha256').update(JSON.stringify({ name, width: raster.width, height: raster.height })).update(bytes).digest('hex');
      const operation = { ...identity, hash };
      const previous = await findCreatedSignature(operation);
      if (previous) return Response.json({ signature: previous }, { headers: signatureHeaders });
      await checkSignatureAccess(tool, user.id, 'create', quote);
      const signature = await saveCreatedSignature(operation, { name, ...trimSignature(raster) });
      return Response.json({ signature }, { headers: signatureHeaders });
    }

    if (input.kind !== 'pdf' && input.kind !== 'image') throw new SignatureError('请选择 PDF、DOCX 或图片');
    const placements = parseSignaturePlacements(input.placements);
    const raster = input.kind === 'image' ? readSignatureRaster(bytes, input.width, input.height, signatureLimits.imagePixels) : null;
    if (!raster && bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new SignatureError('无法读取 PDF，请确认文件完整且未加密');
    }
    const hash = createHash('sha256').update(JSON.stringify({
      name, kind: input.kind, width: raster?.width, height: raster?.height, placements,
    })).update(bytes).digest('hex');
    const operation = { ...identity, hash };
    const previous = await findSignedDocument(user.id, input.id);
    if (previous) return Response.json({ document: reuseSignedDocument(previous, operation) }, { headers: signatureHeaders });

    if (!signatureStorage.ready()) throw new SignatureError('签署文件云存储暂未配置', 503);
    await checkSignatureAccess(tool, user.id, 'sign', quote);
    const assets = new Map<string, Buffer>();
    const stampTool = placements.some(placement => placement.asset === 'stamp') ? await findStampTool() : null;
    for (const placement of placements) {
      const key = signingAssetKey(placement);
      if (assets.has(key)) continue;
      const png = placement.asset === 'stamp'
        ? stampTool && await readSigningStamp(user.id, stampTool.id, placement.signatureId)
        : (await readSignatureImage(user.id, placement.signatureId))?.png;
      if (!png) throw new SignatureError(placement.asset === 'stamp' ? '印章不存在或不属于当前账号' : '请选择签名库中的有效签名', 404);
      assets.set(key, png);
    }
    const result = raster ? signImage(raster, placements, assets) : await signPdf(bytes, placements, assets);
    if (result.length > signatureLimits.resultBytes) throw new SignatureError('签署成品超过20MB，请缩小文件后重试', 413);
    const format = raster ? 'png' : 'pdf';
    const downloadName = `${name.replace(/\.[^.]+$/, '') || 'signed'}-signed.${format}`;
    const object = await signatureStorage.upload({ userId: user.id, id: input.id, name: downloadName, format, bytes: result });
    try {
      const saved = await saveSignedDocument(operation, downloadName, object);
      if (saved.reused) await signatureStorage.discard(object, user.id, input.id);
      return Response.json({ document: saved.document }, { headers: signatureHeaders });
    } catch (error) {
      // 连接可能在提交成功后断开。确认记录指向哪个对象后，才回收本次上传。
      const saved = await reconcileSignedDocument(user.id, input.id).catch(() => undefined);
      if (saved && JSON.parse(saved.storage_json).key === object.key) {
        return Response.json({ document: reuseSignedDocument(saved, operation) }, { headers: signatureHeaders });
      }
      if (saved !== undefined) await signatureStorage.discard(object, user.id, input.id);
      throw error;
    }
  } catch (error) {
    return signatureFailure(error);
  } finally {
    if (acquired) running--;
  }
}
