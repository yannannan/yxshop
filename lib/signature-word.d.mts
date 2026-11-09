export function signatureWordReady(): boolean;
export function validateWordArchive(bytes: Buffer): Promise<void>;
export function convertSignatureWord(bytes: Buffer, signal?: AbortSignal): Promise<Buffer>;
