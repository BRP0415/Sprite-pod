import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, setAuthToken } from "@/lib/queryClient";
import { safeStorage, STORAGE_KEYS } from "@/lib/safeStorage";
import { API_BASE, FORCE_STATIC } from "@/lib/config";
import bundledRoster from "@shared/spriteData.json";
import type { EntryStatus, ProgressItem, ProgressMap, Roster } from "@/lib/roster";
import { variantKey } from "@/lib/roster";

type Mode = "anon" | "guest" | "user";

type ProgressResponse = {
  seasonId: string;
  entries: { spriteId: string; finishId: string; status: EntryStatus; level: number }[];
};

type AuthResult = { token: string; username: string };

type Store = {
  roster: Roster | undefined;
  rosterLoading: boolean;
  rosterError: boolean;
  mode: Mode;
  username: string | null;
  progress: ProgressMap;
  progressLoading: boolean;
  syncing: boolean;
  /** False when there is no reachable API (static hosting) — progress is device-local. */
  backendAvailable: boolean;
  setVariant: (spriteId: string, finishId: string, status: EntryStatus, level?: number) => void;
  resetSeason: () => void;
  register: (username: string, pin: string) => Promise<void>;
  login: (username: string, pin: string) => Promise<void>;
  logout: () => void;
  playAsGuest: () => void;
  guestEntryCount: number;
  /** Serialize the current pod to a backup string. */
  exportProgress: () => string;
  /** Restore a backup string. Returns how many variants were merged in. */
  importProgress: (payload: string) => number;
  /** Set once when a new season has just wiped the board. */
  seasonRollover: SeasonRollover | null;
  dismissSeasonRollover: () => void;
  /** Previous seasons kept on this device, newest first. */
  archivedSeasons: ArchivedSeason[];
  /** Download a past season's pod as a backup file payload. */
  exportArchivedSeason: (seasonId: string) => string;
};

export type ArchivedSeason = {
  seasonId: string;
  seasonName: string;
  archivedAt: string;
  collected: number;
  mastered: number;
  entries: ProgressItem[];
};

type SeasonRollover = {
  fromSeasonId: string;
  toSeasonId: string;
  toSeasonName: string;
  archivedCollected: number;
  archivedMastered: number;
};

/** Keep a handful of seasons; enough for history without bloating storage. */
const MAX_ARCHIVED_SEASONS = 6;

type BackupFile = {
  app: "sprite-pod";
  version: 1;
  seasonId: string;
  exportedAt: string;
  entries: ProgressItem[];
};

const StoreContext = createContext<Store | null>(null);

function toMap(entries: ProgressResponse["entries"]): ProgressMap {
  const map: ProgressMap = {};
  for (const e of entries) {
    if (e.status === "none") continue;
    map[variantKey(e.spriteId, e.finishId)] = { status: e.status, level: e.level ?? 1 };
  }
  return map;
}

function mapToItems(map: ProgressMap): ProgressItem[] {
  return Object.entries(map).map(([key, v]) => {
    const [spriteId, finishId] = key.split(":");
    return { spriteId, finishId, status: v.status, level: v.level };
  });
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => safeStorage.get(STORAGE_KEYS.token));
  const [username, setUsername] = useState<string | null>(() =>
    safeStorage.get(STORAGE_KEYS.username),
  );
  const [mode, setMode] = useState<Mode>(() => {
    if (safeStorage.get(STORAGE_KEYS.token)) return "user";
    return (safeStorage.get(STORAGE_KEYS.mode) as Mode) === "guest" ? "guest" : "anon";
  });
  const [guestProgress, setGuestProgress] = useState<ProgressMap>(() =>
    safeStorage.getJSON<ProgressMap>(STORAGE_KEYS.guest, {}),
  );

  // Keep the shared apiRequest authorized in sync with the token.
  setAuthToken(token);
  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  // On a static host there is no API. Probe once; on failure fall back to the
  // roster compiled into the bundle so the app still works fully offline.
  const [backendAvailable, setBackendAvailable] = useState(!FORCE_STATIC);

  const rosterQuery = useQuery<Roster>({
    queryKey: ["/api/roster"],
    // Sprites arrive with patches, so never sit on a cached roster.
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!FORCE_STATIC) {
        try {
          const res = await fetch(`${API_BASE}/api/roster`);
          if (!res.ok) throw new Error(`roster ${res.status}`);
          const data = (await res.json()) as Roster;
          setBackendAvailable(true);
          return data;
        } catch {
          setBackendAvailable(false);
        }
      }
      // Static hosting: read the roster file that sits next to the app rather
      // than the copy compiled into the JS bundle. The refresh workflow
      // rewrites this file, so an installed app picks up new Sprites on its
      // next launch without anyone reinstalling anything.
      try {
        const url = new URL("roster.json", document.baseURI);
        url.searchParams.set("v", String(Math.floor(Date.now() / 60000)));
        const res = await fetch(url.href, { cache: "no-cache" });
        if (!res.ok) throw new Error(`roster.json ${res.status}`);
        const data = (await res.json()) as Roster;
        if (!data?.season?.id || !Array.isArray(data.sprites) || data.sprites.length === 0) {
          throw new Error("roster.json looked empty");
        }
        return data;
      } catch {
        // Offline, or the file is missing: the bundled copy is still correct
        // as of the last build.
        return bundledRoster as unknown as Roster;
      }
    },
  });

  // ---- season rollover -------------------------------------------------
  // Sprites do not carry between seasons: when Season 4 lands, everyone's
  // collection starts empty. Rather than let a device silently keep showing
  // last season's ticks against a brand-new line-up, archive the finished
  // season and clear the board, then tell the player what happened.
  const [archivedSeasons, setArchivedSeasons] = useState<ArchivedSeason[]>(() =>
    safeStorage.getJSON<ArchivedSeason[]>(STORAGE_KEYS.archive, []),
  );
  const [seasonRollover, setSeasonRollover] = useState<SeasonRollover | null>(null);

  const liveSeasonId = rosterQuery.data?.season.id;
  useEffect(() => {
    if (!liveSeasonId) return;
    const storedSeason = safeStorage.get(STORAGE_KEYS.season);

    // First run on this device: just record which season we're on.
    if (!storedSeason) {
      safeStorage.set(STORAGE_KEYS.season, liveSeasonId);
      return;
    }
    if (storedSeason === liveSeasonId) return;

    const finished = safeStorage.getJSON<ProgressMap>(STORAGE_KEYS.guest, {});
    const entries = mapToItems(finished);
    const mastered = entries.filter((e) => e.status === "mastered").length;

    if (entries.length > 0) {
      const snapshot: ArchivedSeason = {
        seasonId: storedSeason,
        seasonName: storedSeason.toUpperCase(),
        archivedAt: new Date().toISOString(),
        collected: entries.length,
        mastered,
        entries,
      };
      setArchivedSeasons((prev) => {
        const next = [snapshot, ...prev.filter((a) => a.seasonId !== storedSeason)].slice(
          0,
          MAX_ARCHIVED_SEASONS,
        );
        safeStorage.setJSON(STORAGE_KEYS.archive, next);
        return next;
      });
    }

    // Fresh board for the new season.
    setGuestProgress({});
    safeStorage.setJSON(STORAGE_KEYS.guest, {});
    safeStorage.set(STORAGE_KEYS.season, liveSeasonId);

    setSeasonRollover({
      fromSeasonId: storedSeason,
      toSeasonId: liveSeasonId,
      toSeasonName: rosterQuery.data?.season.name ?? liveSeasonId,
      archivedCollected: entries.length,
      archivedMastered: mastered,
    });
  }, [liveSeasonId, rosterQuery.data?.season.name]);

  const dismissSeasonRollover = useCallback(() => setSeasonRollover(null), []);

  const exportArchivedSeason = useCallback(
    (seasonId: string) => {
      const found = archivedSeasons.find((a) => a.seasonId === seasonId);
      const payload: BackupFile = {
        app: "sprite-pod",
        version: 1,
        seasonId,
        exportedAt: new Date().toISOString(),
        entries: found?.entries ?? [],
      };
      return JSON.stringify(payload, null, 2);
    },
    [archivedSeasons],
  );

  // No backend means no accounts: drop any stale token and keep progress local.
  useEffect(() => {
    if (backendAvailable) return;
    if (token) {
      safeStorage.remove(STORAGE_KEYS.token);
      safeStorage.remove(STORAGE_KEYS.username);
      setToken(null);
      setUsername(null);
    }
    setMode((m) => (m === "user" ? "guest" : m));
  }, [backendAvailable, token]);

  const progressQuery = useQuery<ProgressResponse>({
    queryKey: ["/api/progress"],
    enabled: backendAvailable && mode === "user" && !!token,
  });

  // A dead/expired token should drop us back to the sign-in screen, not crash.
  useEffect(() => {
    const err = progressQuery.error as (Error & { status?: number }) | null;
    if (err && err.status === 401) {
      safeStorage.remove(STORAGE_KEYS.token);
      safeStorage.remove(STORAGE_KEYS.username);
      setToken(null);
      setUsername(null);
      setMode("anon");
    }
  }, [progressQuery.error]);

  const serverProgress = useMemo(
    () => (progressQuery.data ? toMap(progressQuery.data.entries) : {}),
    [progressQuery.data],
  );

  const progress = mode === "user" ? serverProgress : guestProgress;

  const putMutation = useMutation({
    mutationFn: async (item: ProgressItem) => {
      const res = await apiRequest("PUT", "/api/progress", item);
      return (await res.json()) as ProgressResponse;
    },
    onSuccess: (data) => queryClient.setQueryData(["/api/progress"], data),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/progress/reset", {});
      return (await res.json()) as ProgressResponse;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/progress"], data);
      // The server clears the showcase alongside the board, and friends see
      // your counts, so both caches are stale the moment a reset lands.
      queryClient.invalidateQueries({ queryKey: ["/api/showcase"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
    },
  });

  const persistGuest = useCallback((next: ProgressMap) => {
    setGuestProgress(next);
    safeStorage.setJSON(STORAGE_KEYS.guest, next);
  }, []);

  const setVariant = useCallback(
    (spriteId: string, finishId: string, status: EntryStatus, level = 1) => {
      const effectiveLevel = status === "mastered" ? 5 : level;
      if (mode === "user") {
        // optimistic
        queryClient.setQueryData<ProgressResponse>(["/api/progress"], (old) => {
          const base = old?.entries ?? [];
          const rest = base.filter((e) => !(e.spriteId === spriteId && e.finishId === finishId));
          const entries =
            status === "none"
              ? rest
              : [...rest, { spriteId, finishId, status, level: effectiveLevel }];
          return { seasonId: old?.seasonId ?? "", entries };
        });
        putMutation.mutate({ spriteId, finishId, status, level: effectiveLevel });
        return;
      }
      const next = { ...guestProgress };
      const key = variantKey(spriteId, finishId);
      if (status === "none") delete next[key];
      else next[key] = { status, level: effectiveLevel };
      persistGuest(next);
      if (mode === "anon") {
        setMode("guest");
        safeStorage.set(STORAGE_KEYS.mode, "guest");
      }
    },
    [mode, guestProgress, persistGuest, putMutation],
  );

  const resetSeason = useCallback(() => {
    if (mode === "user") {
      resetMutation.mutate();
    } else {
      persistGuest({});
    }
  }, [mode, persistGuest, resetMutation]);

  const finishAuth = useCallback(
    async (result: AuthResult, migrate: ProgressMap) => {
      safeStorage.set(STORAGE_KEYS.token, result.token);
      safeStorage.set(STORAGE_KEYS.username, result.username);
      safeStorage.remove(STORAGE_KEYS.mode);
      setAuthToken(result.token);
      setToken(result.token);
      setUsername(result.username);
      setMode("user");
      const items = mapToItems(migrate);
      if (items.length > 0) {
        try {
          await apiRequest("POST", "/api/progress/bulk", { entries: items });
          safeStorage.remove(STORAGE_KEYS.guest);
          setGuestProgress({});
        } catch {
          /* keep guest data locally if the migration fails */
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/progress"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/showcase"] });
    },
    [],
  );

  const register = useCallback(
    async (u: string, pin: string) => {
      const res = await apiRequest("POST", "/api/auth/register", { username: u, pin });
      await finishAuth((await res.json()) as AuthResult, guestProgress);
    },
    [finishAuth, guestProgress],
  );

  const login = useCallback(
    async (u: string, pin: string) => {
      const res = await apiRequest("POST", "/api/auth/login", { username: u, pin });
      await finishAuth((await res.json()) as AuthResult, guestProgress);
    },
    [finishAuth, guestProgress],
  );

  const logout = useCallback(() => {
    apiRequest("POST", "/api/auth/logout", {}).catch(() => undefined);
    safeStorage.remove(STORAGE_KEYS.token);
    safeStorage.remove(STORAGE_KEYS.username);
    setAuthToken(null);
    setToken(null);
    setUsername(null);
    setMode("anon");
    queryClient.removeQueries({ queryKey: ["/api/progress"] });
    // Never let the next account see the previous one's social data.
    queryClient.removeQueries({ queryKey: ["/api/friends"] });
    queryClient.removeQueries({ queryKey: ["/api/showcase"] });
    queryClient.removeQueries({ queryKey: ["friend-search"] });
  }, []);

  const exportProgress = useCallback((): string => {
    const backup: BackupFile = {
      app: "sprite-pod",
      version: 1,
      seasonId: rosterQuery.data?.season.id ?? "unknown",
      exportedAt: new Date().toISOString(),
      entries: mapToItems(progress),
    };
    return JSON.stringify(backup, null, 2);
  }, [progress, rosterQuery.data]);

  const importProgress = useCallback(
    (payload: string): number => {
      const parsed = JSON.parse(payload) as Partial<BackupFile>;
      if (parsed.app !== "sprite-pod" || !Array.isArray(parsed.entries)) {
        throw new Error("That does not look like a Sprite Pod backup");
      }
      const merged: ProgressMap = { ...progress };
      let count = 0;
      for (const e of parsed.entries) {
        if (!e?.spriteId || !e?.finishId) continue;
        if (e.status !== "collected" && e.status !== "mastered") continue;
        const level = e.status === "mastered" ? 5 : Math.min(5, Math.max(1, Number(e.level) || 1));
        merged[variantKey(e.spriteId, e.finishId)] = { status: e.status, level };
        count += 1;
      }
      if (count === 0) return 0;
      if (mode === "user") {
        apiRequest("POST", "/api/progress/bulk", { entries: mapToItems(merged) })
          .then(() => queryClient.invalidateQueries({ queryKey: ["/api/progress"] }))
          .catch(() => undefined);
      } else {
        persistGuest(merged);
        if (mode === "anon") {
          setMode("guest");
          safeStorage.set(STORAGE_KEYS.mode, "guest");
        }
      }
      return count;
    },
    [progress, mode, persistGuest],
  );

  const playAsGuest = useCallback(() => {
    setMode("guest");
    safeStorage.set(STORAGE_KEYS.mode, "guest");
  }, []);

  const value: Store = {
    roster: rosterQuery.data,
    rosterLoading: rosterQuery.isLoading,
    rosterError: rosterQuery.isError,
    backendAvailable,
    mode,
    username,
    progress,
    progressLoading: mode === "user" && progressQuery.isLoading,
    syncing: putMutation.isPending || resetMutation.isPending,
    setVariant,
    resetSeason,
    register,
    login,
    logout,
    playAsGuest,
    guestEntryCount: Object.keys(guestProgress).length,
    exportProgress,
    importProgress,
    seasonRollover,
    dismissSeasonRollover,
    archivedSeasons,
    exportArchivedSeason,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
