export type SignatureObject = { bucket: string; region: string; key: string; size: number; sha256: string };
export class SignatureStorageError extends Error {
  status: number;
  constructor(message: string, status?: number);
}
export type SignatureStorage = {
  ready(): boolean;
  upload(input: { userId: number; id: string; name: string; format: 'pdf' | 'png'; bytes: Buffer }): Promise<SignatureObject>;
  downloadUrl(object: SignatureObject, userId: number, id: string): Promise<string>;
  discard(object: SignatureObject, userId: number, id: string): Promise<void>;
};
export function createSignatureStorage(options?: {
  environment?: () => Record<string, string | undefined>;
  createClient?: (options: Record<string, unknown>) => unknown;
}): SignatureStorage;
export const signatureStorage: SignatureStorage;
