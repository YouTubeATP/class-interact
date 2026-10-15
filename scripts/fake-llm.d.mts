export interface FakeLlmRequest { headers: Record<string, string | string[] | undefined>; body: any }
export function startFakeLlm(opts?: { port?: number }): Promise<{ url: string; requests: FakeLlmRequest[]; close(): Promise<void> }>;
