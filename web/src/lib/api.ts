import type {
  ClientConfig, JoinLookup, JoinResponse, PresentationDoc, PresentationSummary, ProjectorClaim, SessionControlInfo, SessionMode,
  SessionResultsView, SessionSummary, DocIssue, FeaturesPatch, PresentationTemplate, ImportResult, TermGroupSuggestion, SessionAnalytics, SessionRecap, DelegateRole,
} from '@classinteract/shared';
import type { LearnerReport } from './learners';
import { STUDIO_TOKEN_KEY, store } from './storage';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public issues?: DocIssue[],
  ) {
    super(message);
  }
}

type Init = { method?: string; body?: unknown; raw?: BodyInit; contentType?: string; studio?: boolean };

async function request<T>(path: string, init: Init = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = store.get<string>(STUDIO_TOKEN_KEY);
  if (token) headers.authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (init.raw !== undefined) {
    body = init.raw;
    if (init.contentType) headers['content-type'] = init.contentType;
  } else if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    headers['content-type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(path, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get('content-type')?.includes('json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const e = (data as any)?.error;
    if (res.status === 401 && path.startsWith('/api/studio')) window.dispatchEvent(new Event('ci:unauthorized'));
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? `Request failed (${res.status})`, e?.details?.issues);
  }
  return data as T;
}

/** Fetches a file with the studio token and hands it to the browser as a download. */
export async function download(path: string, fallbackName: string) {
  const headers: Record<string, string> = {};
  const token = store.get<string>(STUDIO_TOKEN_KEY);
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(path, { headers });
  if (!res.ok) throw new ApiError(res.status, 'ERROR', 'The download failed. Try again.');
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const api = {
  config: () => request<ClientConfig>('/api/config'),
  login: (password: string) => request<{ token: string }>('/api/auth/login', { body: { password } }),
  lookup: (pin: string) => request<JoinLookup>(`/api/join/${pin}`),
  claimProjector: (code: string) => request<ProjectorClaim>('/api/projector/claim', { body: { code } }),
  join: (body: { pin: string; name?: string; token?: string; learnerKey?: string; remember?: boolean; shareProgress?: boolean }) => request<JoinResponse>('/api/join', { body }),

  presentations: {
    list: () => request<PresentationSummary[]>('/api/studio/presentations'),
    get: (id: string) => request<{ id: string; updatedAt: string; doc: PresentationDoc }>(`/api/studio/presentations/${id}`),
    create: (title: string) => request<{ id: string }>('/api/studio/presentations', { body: { title } }),
    import: (doc: unknown) => request<{ id: string; warnings: string[] }>('/api/studio/presentations/import', { body: doc }),
    save: (id: string, doc: PresentationDoc) => request<{ updatedAt: string }>(`/api/studio/presentations/${id}`, { method: 'PUT', body: doc }),
    duplicate: (id: string) => request<{ id: string }>(`/api/studio/presentations/${id}/duplicate`, { method: 'POST', body: {} }),
    remove: (id: string) => request<void>(`/api/studio/presentations/${id}`, { method: 'DELETE' }),
    export: (id: string) => download(`/api/studio/presentations/${id}/export`, 'presentation.classinteract.json'),
    startSession: (id: string, opts: { collectNames: boolean; mode: SessionMode; features?: FeaturesPatch }) =>
      request<{ id: string; pin: string }>(`/api/studio/presentations/${id}/sessions`, { body: opts }),
    rehearse: (id: string, opts: { participants: number; mode?: SessionMode }) => request<{ id: string; pin: string }>(`/api/studio/presentations/${id}/rehearse`, { body: opts }),
  },
  templates: {
    list: () => request<Omit<PresentationTemplate, 'doc'>[]>('/api/studio/templates'),
    create: (id: string) => request<{ id: string }>(`/api/studio/templates/${id}`, { method: 'POST', body: {} }),
  },
  ai: {
    convert: (text: string, existingIds: string[]) => request<ImportResult>('/api/studio/ai/convert', { body: { text, existingIds } }),
    recap: (sessionId: string) => request<{ text: string }>(`/api/studio/sessions/${sessionId}/recap/ai`, { body: {} }),
    grouping: (sessionId: string, terms: { key: string; label: string; count: number }[]) => request<{ suggestions: TermGroupSuggestion[] }>(`/api/studio/sessions/${sessionId}/grouping/ai`, { body: { terms } }),
  },
  sessions: {
    list: () => request<SessionSummary[]>('/api/studio/sessions'),
    control: (id: string) => request<SessionControlInfo>(`/api/studio/sessions/${id}/control`),
    results: (id: string) => request<SessionResultsView>(`/api/studio/sessions/${id}/results`),
    exportCsv: (id: string) => download(`/api/studio/sessions/${id}/export.csv`, 'responses.csv'),
    remove: (id: string) => request<void>(`/api/studio/sessions/${id}`, { method: 'DELETE' }),
    analytics: (id: string) => request<{ analytics: SessionAnalytics; recap: SessionRecap; rehearsal: boolean }>(`/api/studio/sessions/${id}/analytics`),
    createGrant: (id: string, role: DelegateRole, label: string) => request<{ id: string; token: string; path: string }>(`/api/studio/sessions/${id}/grants`, { body: { role, label } }),
    revokeGrant: (id: string, grantId: string) => request<void>(`/api/studio/sessions/${id}/grants/${grantId}`, { method: 'DELETE' }),
  },
  delegate: {
    claim: (sessionId: string, token: string) => request<SessionControlInfo>('/api/delegate/claim', { body: { sessionId, token } }),
  },
  learners: {
    report: () => request<LearnerReport>('/api/studio/learners'),
    label: (id: string, label: string) => request<void>(`/api/studio/learners/${id}`, { method: 'PATCH', body: { label } }),
    remove: (id: string) => request<void>(`/api/studio/learners/${id}`, { method: 'DELETE' }),
    forget: (key: string) => request<{ ok: boolean }>('/api/learner/forget', { body: { key } }),
    share: (key: string, share: boolean) => request<{ ok: boolean }>('/api/learner/share', { body: { key, share } }),
  },
  async upload(file: File): Promise<{ url: string }> {
    return request<{ url: string }>('/api/studio/uploads', { raw: file, contentType: file.type });
  },
  async uploadMedia(file: File): Promise<{ url: string }> {
    if (file.size > 25 * 1024 * 1024) throw new ApiError(413, 'TOO_LARGE', 'That file is larger than 25 MB.');
    return request<{ url: string }>('/api/studio/uploads/media', { raw: file, contentType: file.type === 'audio/x-m4a' ? 'audio/mp4' : file.type });
  },
};
