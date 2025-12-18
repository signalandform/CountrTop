import { DataClient } from './dataClient';
import { User } from './models';

export type AuthStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type AuthSession = {
  user: User | null;
};

type Listener = (session: AuthSession) => void;

const createMemoryStorage = (): AuthStorage => {
  const store = new Map<string, string>();
  return {
    async getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    async setItem(key, value) {
      store.set(key, value);
    },
    async removeItem(key) {
      store.delete(key);
    }
  };
};

export type SessionManagerOptions = {
  dataClient: DataClient;
  storage?: AuthStorage;
  storageKey?: string;
};

export const createSessionManager = (options: SessionManagerOptions) => {
  const { dataClient, storage = createMemoryStorage(), storageKey = 'countrtop.session' } = options;
  let currentSession: AuthSession = { user: null };
  const listeners = new Set<Listener>();

  const notify = () => {
    listeners.forEach((listener) => listener(currentSession));
  };

  const persist = async () => {
    if (currentSession.user) {
      await storage.setItem(storageKey, JSON.stringify(currentSession.user));
    } else {
      await storage.removeItem(storageKey);
    }
  };

  const bootstrap = async () => {
    const stored = await storage.getItem(storageKey);
    if (stored) {
      try {
        const user = JSON.parse(stored) as User;
        currentSession = { user };
        notify();
        return user;
      } catch {
        // fall through to live lookup
      }
    }
    const user = await dataClient.getCurrentUser();
    currentSession = { user };
    await persist();
    notify();
    return user;
  };

  const signInWithEmail = async (email: string, password: string) => {
    const user = await dataClient.signInWithEmail(email, password);
    currentSession = { user };
    await persist();
    notify();
    return user;
  };

  const signOut = async () => {
    await dataClient.signOut();
    currentSession = { user: null };
    await persist();
    notify();
  };

  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    bootstrap,
    getSession: () => currentSession,
    signInWithEmail,
    signOut,
    subscribe
  };
};

export type SessionManager = ReturnType<typeof createSessionManager>;
