export function signatureWordReady(): Promise<boolean>;
export function signatureWordReadiness(): Promise<{ supported: boolean; enabled: boolean; missing: string[]; issue: string; ready: boolean }>;
export function validateWordArchive(bytes: Buffer): Promise<void>;
export function convertSignatureWord(bytes: Buffer, signal?: AbortSignal): Promise<Buffer>;
