/**
 * API keys the user chose to keep in this browser only.
 * Stored per Firebase user so shared browsers don't mix accounts.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
const EMPTY: Record<string, string> = {};
const cache = new Map<string, Record<string, string>>();

const storageKey = (userId: string) => `rc.ai.keys.${userId}`;

const readFromStorage = (userId: string): Record<string, string> => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object') {
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string'
        )
      );
    }
  } catch {
    // Storage unavailable or corrupted: behave as if no keys are stored.
  }
  return {};
};

const notify = () => listeners.forEach((listener) => listener());

export const getLocalKeys = (userId: string | undefined) => {
  if (!userId) return EMPTY;
  let keys = cache.get(userId);
  if (!keys) {
    keys = readFromStorage(userId);
    cache.set(userId, keys);
  }
  return keys;
};

export const setLocalKeys = (userId: string, keys: Record<string, string>) => {
  try {
    if (Object.keys(keys).length === 0) {
      localStorage.removeItem(storageKey(userId));
    } else {
      localStorage.setItem(storageKey(userId), JSON.stringify(keys));
    }
  } catch {
    throw new Error(
      'This browser does not allow saving data locally. Store keys in your account instead.'
    );
  }
  cache.set(userId, { ...keys });
  notify();
};

export const subscribeLocalKeys = (listener: Listener) => {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith('rc.ai.keys.')) {
      cache.clear();
      listener();
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
};
