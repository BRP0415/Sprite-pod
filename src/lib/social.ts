/**
 * Friends, showcases and comparison — the social half of the app.
 *
 * Everything here needs the Express backend. On a static-only host (GitHub
 * Pages with no API) `backendAvailable` is false and these hooks stay idle,
 * so the Friends screen can show an explanation instead of spinning forever.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { API_BASE } from "@/lib/config";
import { useStore } from "@/lib/store";
import type { ProgressMap, Roster, Sprite, Finish, EntryStatus } from "@/lib/roster";
import { allVariants, variantKey } from "@/lib/roster";

export const SHOWCASE_MAX = 4;

export type ShowcasePick = { spriteId: string; finishId: string };

export type FriendSummary = {
  username: string;
  collected: number;
  mastered: number;
  showcase: ShowcasePick[];
  since: number;
};

export type PendingRequest = { username: string; sentAt: number };

export type FriendsPayload = {
  seasonId: string;
  friends: FriendSummary[];
  incoming: PendingRequest[];
  outgoing: PendingRequest[];
};

export type FriendPod = {
  username: string;
  seasonId: string;
  since: number;
  showcase: ShowcasePick[];
  entries: { spriteId: string; finishId: string; status: EntryStatus; level: number }[];
};

export type SearchResult = {
  username: string;
  relation: "none" | "friends" | "incoming" | "outgoing";
};

/** Social features need both a reachable API and a signed-in account. */
export function useSocialReady() {
  const { backendAvailable, mode } = useStore();
  return {
    backendAvailable,
    signedIn: mode === "user",
    ready: backendAvailable && mode === "user",
  };
}

export function useFriends() {
  const { ready } = useSocialReady();
  return useQuery<FriendsPayload>({
    queryKey: ["/api/friends"],
    enabled: ready,
    staleTime: 15_000,
    // Requests arrive while you are looking at the screen, so keep it fresh.
    refetchInterval: ready ? 30_000 : false,
  });
}

export function useFriendPod(username: string | null) {
  const { ready } = useSocialReady();
  return useQuery<FriendPod>({
    queryKey: ["/api/friends", username ?? "", "pod"],
    enabled: ready && !!username,
    staleTime: 15_000,
    retry: false,
  });
}

export function useUserSearch(query: string) {
  const { ready } = useSocialReady();
  const trimmed = query.trim();
  return useQuery<{ results: SearchResult[] }>({
    queryKey: ["friend-search", trimmed],
    enabled: ready && trimmed.length >= 2,
    staleTime: 5_000,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/friends/search?q=${encodeURIComponent(trimmed)}`);
      return res.json();
    },
  });
}

/** Every friend mutation refreshes the same list, so share one helper. */
function useFriendMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/friends"] });
      qc.invalidateQueries({ queryKey: ["friend-search"] });
    },
  });
}

export function useSendRequest() {
  return useFriendMutation<string>(async (username) => {
    const res = await apiRequest("POST", "/api/friends/requests", { username });
    return res.json();
  });
}

export function useAcceptRequest() {
  return useFriendMutation<string>(async (username) => {
    const res = await apiRequest(
      "POST",
      `/api/friends/requests/${encodeURIComponent(username)}/accept`,
    );
    return res.json();
  });
}

/** Decline, cancel and unfriend all resolve to the same delete. */
export function useRemoveFriend() {
  return useFriendMutation<string>(async (username) => {
    const res = await apiRequest("DELETE", `/api/friends/${encodeURIComponent(username)}`);
    return res.json();
  });
}

export function useShowcase() {
  const { ready } = useSocialReady();
  return useQuery<{ max: number; items: ShowcasePick[] }>({
    queryKey: ["/api/showcase"],
    enabled: ready,
    staleTime: 30_000,
  });
}

export function useSaveShowcase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: ShowcasePick[]) => {
      const res = await apiRequest("PUT", "/api/showcase", { items });
      return res.json();
    },
    onSuccess: (data) => {
      qc.setQueryData(["/api/showcase"], data);
      qc.invalidateQueries({ queryKey: ["/api/friends"] });
    },
  });
}

// ---- comparison ---------------------------------------------------------

export type CompareRow = {
  spriteId: string;
  finishId: string;
  sprite: Sprite;
  finish: Finish;
  mine: EntryStatus;
  theirs: EntryStatus;
  myLevel: number;
  theirLevel: number;
};

export type Comparison = {
  /** They have it, you do not — your shopping list. */
  theyHave: CompareRow[];
  /** You have it, they do not — your bragging list. */
  youHave: CompareRow[];
  /** Both collected, but one of you has mastered it. */
  masteryGap: CompareRow[];
  /** Neither of you has touched it yet. */
  bothMissing: CompareRow[];
  mine: { collected: number; mastered: number };
  theirs: { collected: number; mastered: number };
  total: number;
};

function rank(status: EntryStatus): number {
  return status === "mastered" ? 2 : status === "collected" ? 1 : 0;
}

/** Turns two progress maps into the four lists the compare screen renders. */
export function compareProgress(
  roster: Roster,
  mineMap: ProgressMap,
  theirsMap: ProgressMap,
): Comparison {
  const out: Comparison = {
    theyHave: [],
    youHave: [],
    masteryGap: [],
    bothMissing: [],
    mine: { collected: 0, mastered: 0 },
    theirs: { collected: 0, mastered: 0 },
    total: 0,
  };

  const spriteById = new Map(roster.sprites.map((s) => [s.id, s]));
  const finishesById = new Map(roster.finishes.map((f) => [f.id, f]));

  for (const { spriteId, finishId } of allVariants(roster)) {
    const sprite = spriteById.get(spriteId);
    const finish = finishesById.get(finishId);
    if (!sprite || !finish) continue;
    const key = variantKey(spriteId, finishId);
    const mineEntry = mineMap[key];
    const theirEntry = theirsMap[key];
    const mine: EntryStatus = mineEntry?.status ?? "none";
    const theirs: EntryStatus = theirEntry?.status ?? "none";

    out.total += 1;
    if (rank(mine) >= 1) out.mine.collected += 1;
    if (mine === "mastered") out.mine.mastered += 1;
    if (rank(theirs) >= 1) out.theirs.collected += 1;
    if (theirs === "mastered") out.theirs.mastered += 1;

    const row: CompareRow = {
      spriteId,
      finishId,
      sprite,
      finish,
      mine,
      theirs,
      myLevel: mineEntry?.level ?? 1,
      theirLevel: theirEntry?.level ?? 1,
    };

    if (rank(theirs) >= 1 && rank(mine) === 0) out.theyHave.push(row);
    else if (rank(mine) >= 1 && rank(theirs) === 0) out.youHave.push(row);
    else if (rank(mine) === 0 && rank(theirs) === 0) out.bothMissing.push(row);
    else if (mine !== theirs) out.masteryGap.push(row);
  }

  return out;
}

/** Server entry rows -> the same ProgressMap shape the rest of the app uses. */
export function entriesToProgress(entries: FriendPod["entries"]): ProgressMap {
  const map: ProgressMap = {};
  for (const e of entries) {
    map[variantKey(e.spriteId, e.finishId)] = { status: e.status, level: e.level };
  }
  return map;
}

/** Exposed for the README/debugging — which API the social calls are hitting. */
export const SOCIAL_API_BASE = API_BASE;
export { getQueryFn };
