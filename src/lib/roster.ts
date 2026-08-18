export type Finish = { id: string; name: string; bonus: string; hex: string };
export type Rarity = { id: string; hex: string };
export type Sprite = {
  id: string;
  name: string;
  rarity: string;
  dropRate: string;
  ability: string;
  finishes: string[];
};
export type Milestone = { count: number; reward: string };
export type Season = {
  id: string;
  chapter: number;
  season: number;
  name: string;
  endsOn: string | null;
  note: string;
  dataVersion: string;
  sources: string[];
};
export type Roster = {
  season: Season;
  finishes: Finish[];
  rarities: Rarity[];
  sprites: Sprite[];
  masteryMilestones: Milestone[];
};

export type EntryStatus = "none" | "collected" | "mastered";
export type ProgressItem = { spriteId: string; finishId: string; status: EntryStatus; level: number };
export type ProgressMap = Record<string, { status: EntryStatus; level: number }>;

export const variantKey = (spriteId: string, finishId: string) => `${spriteId}:${finishId}`;

export function getVariant(progress: ProgressMap, spriteId: string, finishId: string) {
  return progress[variantKey(spriteId, finishId)] ?? { status: "none" as EntryStatus, level: 1 };
}

export function nextStatus(status: EntryStatus): EntryStatus {
  if (status === "none") return "collected";
  if (status === "collected") return "mastered";
  return "none";
}

/** All variants derived from the roster — never hardcode totals. */
export function allVariants(roster: Roster): { spriteId: string; finishId: string }[] {
  return roster.sprites.flatMap((s) => s.finishes.map((f) => ({ spriteId: s.id, finishId: f })));
}

export function totals(roster: Roster, progress: ProgressMap) {
  const variants = allVariants(roster);
  let collected = 0;
  let mastered = 0;
  let almost = 0;
  for (const v of variants) {
    const e = getVariant(progress, v.spriteId, v.finishId);
    if (e.status === "mastered") {
      mastered += 1;
      collected += 1;
    } else if (e.status === "collected") {
      collected += 1;
      if (e.level >= 4) almost += 1;
    }
  }
  const total = variants.length;
  return { total, collected, mastered, almost, remaining: total - collected };
}

export function groupStats(sprite: Sprite, progress: ProgressMap) {
  let collected = 0;
  let mastered = 0;
  for (const f of sprite.finishes) {
    const e = getVariant(progress, sprite.id, f);
    if (e.status === "mastered") {
      mastered += 1;
      collected += 1;
    } else if (e.status === "collected") collected += 1;
  }
  return { collected, mastered, total: sprite.finishes.length };
}

export function parseDropRate(dropRate: string): number {
  const n = parseFloat(dropRate.replace("%", ""));
  return Number.isFinite(n) ? n : 0;
}

/** Highest drop-rate variants the player still needs. */
export function nextUp(roster: Roster, progress: ProgressMap, limit = 8) {
  return allVariants(roster)
    .filter((v) => getVariant(progress, v.spriteId, v.finishId).status === "none")
    .map((v) => {
      const sprite = roster.sprites.find((s) => s.id === v.spriteId)!;
      return { ...v, sprite, rate: parseDropRate(sprite.dropRate) };
    })
    .sort((a, b) => b.rate - a.rate)
    .slice(0, limit);
}

export function nextMilestone(roster: Roster, mastered: number) {
  const sorted = [...roster.masteryMilestones].sort((a, b) => a.count - b.count);
  return sorted.find((m) => m.count > mastered) ?? null;
}

export function rarityHex(roster: Roster, rarityId: string) {
  return roster.rarities.find((r) => r.id === rarityId)?.hex ?? "#9aa4b2";
}

export function finishById(roster: Roster, finishId: string) {
  return roster.finishes.find((f) => f.id === finishId);
}

export function daysUntil(dateStr: string | null | undefined, now = new Date()) {
  const end = dateStr ? new Date(`${dateStr}T00:00:00Z`).getTime() : NaN;
  // A brand-new season is often detected before its end date is announced, so
  // treat a missing or unparseable date as "unknown" rather than rendering NaN.
  if (!Number.isFinite(end)) return { unknown: true, over: false, days: 0, hours: 0 };
  const diff = end - now.getTime();
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  return { unknown: false, over: diff <= 0, days: Math.max(0, days), hours: Math.max(0, hours) };
}
