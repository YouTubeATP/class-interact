/** localStorage wrappers that never throw (private windows, blocked storage, previews). */
export const store = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: the app still works, it just cannot remember */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export interface ParticipantCredential {
  sessionId: string;
  participantId: string;
  token: string;
  name: string;
}

export const participantKey = (sessionId: string) => `ci:p:${sessionId}`;
export const pinKey = (pin: string) => `ci:pin:${pin}`;
export const STUDIO_TOKEN_KEY = 'ci:studio-token';

export function saveCredential(pin: string, cred: ParticipantCredential) {
  store.set(participantKey(cred.sessionId), cred);
  store.set(pinKey(pin), cred.sessionId);
}
export const loadCredential = (sessionId: string) => store.get<ParticipantCredential>(participantKey(sessionId));
export function credentialForPin(pin: string): ParticipantCredential | null {
  const sessionId = store.get<string>(pinKey(pin));
  return sessionId ? loadCredential(sessionId) : null;
}
