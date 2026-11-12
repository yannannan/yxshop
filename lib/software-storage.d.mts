export type SoftwareObject = { bucket: string; region: string; key: string; size: number; sha256: string };
export class SoftwareStorageError extends Error { status: number; constructor(message: string, status?: number); }
export type SoftwareStorage = {
  ready(): boolean; validate(object: SoftwareObject, release: string): SoftwareObject;
  upload(input: { request: Request; release: string; name: string; size: number }): Promise<SoftwareObject>;
  verify(object: SoftwareObject, release: string): Promise<void>;
  downloadUrl(object: SoftwareObject, release: string): Promise<string>;
  discard(object: SoftwareObject, release: string): Promise<void>;
};
export function createSoftwareStorage(options?: { environment?: () => Record<string, string | undefined>; createClient?: (options: Record<string, unknown>) => unknown; stagingRoot?: () => string }): SoftwareStorage;
export const softwareStorage: SoftwareStorage;
