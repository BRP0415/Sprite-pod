/**
 * safeStorage — localStorage that cannot crash the app.
 *
 * The app is previewed inside a sandboxed iframe with an opaque origin where
 * every localStorage access THROWS. We try localStorage first (real iPhone
 * Safari, installed PWA), then fall back to window.name (survives in-page
 * navigations within the preview) and finally an in-memory object.
 */

const memory: Record<string, string> = {};
const NAME_PREFIX = "sprite-pod::";

function ls(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = "__sp_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function readWindowName(): Record<string, string> {
  try {
    if (typeof window === "undefined") return {};
    if (!window.name || !window.name.startsWith(NAME_PREFIX)) return {};
    return JSON.parse(window.name.slice(NAME_PREFIX.length)) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeWindowName(data: Record<string, string>) {
  try {
    window.name = NAME_PREFIX + JSON.stringify(data);
  } catch {
    /* ignore */
  }
}

export const safeStorage = {
  get(key: string): string | null {
    try {
      const store = ls();
      if (store) {
        const v = store.getItem(key);
        if (v !== null) return v;
      }
    } catch {
      /* ignore */
    }
    const fromName = readWindowName();
    if (key in fromName) return fromName[key];
    return key in memory ? memory[key] : null;
  },

  set(key: string, value: string): void {
    memory[key] = value;
    try {
      const store = ls();
      if (store) store.setItem(key, value);
    } catch {
      /* ignore */
    }
    const data = readWindowName();
    data[key] = value;
    writeWindowName(data);
  },

  remove(key: string): void {
    delete memory[key];
    try {
      const store = ls();
      if (store) store.removeItem(key);
    } catch {
      /* ignore */
    }
    const data = readWindowName();
    delete data[key];
    writeWindowName(data);
  },

  getJSON<T>(key: string, fallback: T): T {
    const raw = safeStorage.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  setJSON(key: string, value: unknown): void {
    try {
      safeStorage.set(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
};

export const STORAGE_KEYS = {
  token: "sp.token",
  username: "sp.username",
  guest: "sp.guestProgress",
  mode: "sp.mode",
  /** Season the locally stored progress belongs to. */
  season: "sp.seasonId",
  /** Past seasons, kept after a reset so nothing is silently thrown away. */
  archive: "sp.archive",
};
