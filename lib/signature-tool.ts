import { isStampId } from './stamp-options';

export const signatureToolSlug = 'document-signature';
export const signatureApi = '/api/tools/document-signature';
export const signatureActions = {
  create: '制作签名',
  sign: '签署文件',
  handprint: '手印制作',
} as const;

export type SignatureAction = keyof typeof signatureActions;
export type SignatureQuote = { chargeType: string; cost: number };
export type SignaturePlacement = {
  signatureId: string;
  asset?: 'stamp' | 'handprint';
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SavedSignature = {
  id: string;
  name: string;
  width: number;
  height: number;
  pointsSpent: number;
  previewUrl: string;
  createdAt?: string;
};

export type SavedStamp = Pick<SavedSignature, 'id' | 'width' | 'height' | 'previewUrl'> & { createdAt: string };

export type SignedDocument = {
  id: string;
  name: string;
  bytes: number;
  pointsSpent: number;
  expiresAt: string;
  downloadUrl: string;
};

export type SignatureAccess = {
  signedIn: boolean;
  chargeType: string;
  pointsBalance: number;
  hasMembership: boolean;
  canProcess: boolean;
  costs: Record<SignatureAction, number>;
  storageReady: boolean;
  wordReady: boolean;
  signatures: SavedSignature[];
  stamps: SavedStamp[];
  handprints: SavedSignature[];
  handprintReady: boolean;
  documents: SignedDocument[];
};

export const signatureLimits = {
  fileBytes: 12 * 1024 * 1024,
  resultBytes: 20 * 1024 * 1024,
  imagePixels: 2_000_000,
  signaturePixels: 400_000,
  pages: 100,
  placements: 30,
  savedSignatures: 30,
  retentionDays: 7,
};

export class SignatureError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function isSignatureId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

export function signingAssetKey(placement: Pick<SignaturePlacement, 'signatureId' | 'asset'>) {
  return placement.asset ? `${placement.asset}:${placement.signatureId}` : placement.signatureId;
}

export function signatureName(value: unknown, limit = 100) {
  return typeof value === 'string'
    ? value.toWellFormed().replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '-').trim().slice(0, limit).toWellFormed()
    : '';
}

export function parseSignaturePlacements(value: unknown): SignaturePlacement[] {
  if (!Array.isArray(value) || !value.length || value.length > signatureLimits.placements) {
    throw new SignatureError('请添加至少一个签名位置，最多30处');
  }
  return value.map(placement => {
    const { signatureId, page, x, y, width, height, asset } = placement || {};
    if ((asset !== undefined && asset !== 'stamp' && asset !== 'handprint') || !(asset === 'stamp' ? isStampId(signatureId) : isSignatureId(signatureId)) ||
      !Number.isInteger(page) || page < 1 || page > signatureLimits.pages ||
      ![x, y, width, height].every(Number.isFinite) || x < 0 || x >= 1 || y < 0 || y >= 1 || width <= 0 || height <= 0 ||
      x + width > 1.000001 || y + height > 1.000001) {
      throw new SignatureError('签名位置超出页面范围');
    }
    return asset
      ? { signatureId: signatureId.toLowerCase(), page, x, y, width, height, asset }
      : { signatureId, page, x, y, width, height };
  });
}
