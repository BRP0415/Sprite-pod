/**
 * Small pieces shared by the Friends list, a friend's pod and the compare
 * screen. Kept read-only on purpose — you can look at a friend's board but
 * never edit it.
 */
import { useMemo, useState } from "react";
import { Crown, ServerOff, ShieldCheck, Sparkles } from "lucide-react";
import { PodTile } from "@/components/PodTile";
import {
  finishById,
  getVariant,
  groupStats,
  rarityHex,
  variantKey,
  type EntryStatus,
  type ProgressMap,
  type Roster,
  type Sprite,
} from "@/lib/roster";
import { SHOWCASE_MAX, type ShowcasePick } from "@/lib/social";
import { cn } from "@/lib/utils";

/** Static builds (GitHub Pages with no API) cannot do accounts or friends. */
export function BackendRequiredCard() {
  return (
    <div
      className="mx-4 mt-4 rounded-2xl border border-card-border bg-card p-4"
      data-testid="card-backend-required"
    >
      <div className="flex items-center gap-2">
        <ServerOff className="h-4 w-4 shrink-0 text-accent" />
        <h2 className="text-[13px] font-bold uppercase tracking-wider">Friends need the server</h2>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
        This copy of Sprite Pod is running as a static site, so there is nowhere to store accounts
        or friend requests. Everything else — your board, levels, backups — keeps working on this
        device.
      </p>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
        To switch friends on, deploy the included Express server (Render, Fly.io and Railway all
        have free tiers), then rebuild the site with{" "}
        <code className="rounded bg-background px-1 py-0.5 text-[10.5px] text-primary">
          VITE_API_BASE
        </code>{" "}
        pointed at it. The README walks through it step by step.
      </p>
    </div>
  );
}

export function SignInRequiredCard({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div
      className="mx-4 mt-4 rounded-2xl border border-card-border bg-card p-4"
      data-testid="card-signin-required"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="text-[13px] font-bold uppercase tracking-wider">Sign in to add friends</h2>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
        Friends are tied to your username, so you need an account before you can send or receive
        requests. Your guest progress comes with you.
      </p>
      <button
        type="button"
        onClick={onSignIn}
        data-testid="button-social-signin"
        className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-[12.5px] font-bold uppercase tracking-wider text-primary-foreground active:scale-[0.98]"
      >
        Create account / sign in
      </button>
    </div>
  );
}

/** Up to four pinned variants, padded with empty slots so the row never jumps. */
export function ShowcaseStrip({
  items,
  size = 44,
  testId,
  emptyLabel = "No showcase yet",
}: {
  items: ShowcasePick[];
  size?: number;
  testId?: string;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground" data-testid={testId}>
        {emptyLabel}
      </p>
    );
  }
  return (
    <div className="flex gap-1.5" data-testid={testId}>
      {items.slice(0, SHOWCASE_MAX).map((item) => (
        <PodTile
          key={variantKey(item.spriteId, item.finishId)}
          spriteId={item.spriteId}
          finishId={item.finishId}
          size={size}
          status="mastered"
        />
      ))}
    </div>
  );
}

type BoardFilter = "all" | "collected" | "mastered" | "missing";

const BOARD_FILTERS: { id: BoardFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "collected", label: "Collected" },
  { id: "mastered", label: "Mastered" },
  { id: "missing", label: "Missing" },
];

function matches(filter: BoardFilter, entry: { status: EntryStatus }) {
  if (filter === "all") return true;
  if (filter === "missing") return entry.status === "none";
  if (filter === "collected") return entry.status !== "none";
  return entry.status === "mastered";
}

/** A friend's board: the same grouping as your own Collection, minus the taps. */
export function ReadOnlyBoard({
  roster,
  progress,
  ownerLabel,
}: {
  roster: Roster;
  progress: ProgressMap;
  ownerLabel: string;
}) {
  const [filter, setFilter] = useState<BoardFilter>("all");

  const groups = useMemo(
    () =>
      roster.sprites
        .map((sprite) => ({
          sprite,
          visible: sprite.finishes.filter((f) => matches(filter, getVariant(progress, sprite.id, f))),
        }))
        .filter((g) => g.visible.length > 0),
    [roster, progress, filter],
  );

  const shown = groups.reduce((n, g) => n + g.visible.length, 0);
  const total = roster.sprites.reduce((n, s) => n + s.finishes.length, 0);

  return (
    <div>
      <div className="scrollbar-none fade-x flex gap-1.5 overflow-x-auto px-4 pb-0.5">
        {BOARD_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            data-testid={`button-friend-filter-${f.id}`}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-lg px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors",
              filter === f.id
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p
        className="num px-4 pt-2.5 text-[11px] text-muted-foreground"
        data-testid="text-friend-result-count"
      >
        Showing {shown} of {total} variants on {ownerLabel}
      </p>

      <div className="mt-2 space-y-2.5 px-4">
        {groups.length === 0 ? (
          <p
            className="rounded-2xl border border-card-border bg-card p-5 text-center text-[12.5px] text-muted-foreground"
            data-testid="text-friend-board-empty"
          >
            Nothing matches this filter.
          </p>
        ) : (
          groups.map((g) => (
            <ReadOnlySpriteCard
              key={g.sprite.id}
              sprite={g.sprite}
              roster={roster}
              progress={progress}
              visibleFinishes={g.visible}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ReadOnlySpriteCard({
  sprite,
  roster,
  progress,
  visibleFinishes,
}: {
  sprite: Sprite;
  roster: Roster;
  progress: ProgressMap;
  visibleFinishes: string[];
}) {
  const stats = groupStats(sprite, progress);
  return (
    <article
      className="rounded-2xl border border-card-border bg-card p-3"
      data-testid={`card-friend-sprite-${sprite.id}`}
    >
      <div className="flex items-start gap-3">
        <PodTile
          spriteId={sprite.id}
          finishId={stats.mastered > 0 ? "gold" : "normal"}
          size={44}
          status={stats.collected > 0 ? (stats.mastered > 0 ? "mastered" : "collected") : "none"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[13.5px] font-bold">{sprite.name}</h3>
            <span
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
              style={{
                color: rarityHex(roster, sprite.rarity),
                background: `${rarityHex(roster, sprite.rarity)}22`,
                boxShadow: `inset 0 0 0 1px ${rarityHex(roster, sprite.rarity)}55`,
              }}
            >
              {sprite.rarity}
            </span>
          </div>
          <p
            className="num mt-1 text-[10.5px] font-semibold text-muted-foreground"
            data-testid={`text-friend-group-stats-${sprite.id}`}
          >
            {stats.collected}/{stats.total} collected · {stats.mastered} mastered
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {visibleFinishes.map((f) => {
          const entry = getVariant(progress, sprite.id, f);
          const finish = finishById(roster, f);
          const active = entry.status !== "none";
          return (
            <div
              key={variantKey(sprite.id, f)}
              data-testid={`chip-friend-variant-${sprite.id}-${f}`}
              data-status={entry.status}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-1.5 py-1",
                active ? "bg-white/[0.04]" : "bg-background/60",
              )}
              style={{
                borderColor: active ? `${finish?.hex}99` : "hsl(var(--border))",
              }}
            >
              <PodTile spriteId={sprite.id} finishId={f} size={28} status={entry.status} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span
                  className="truncate text-[10.5px] font-bold uppercase tracking-wide"
                  style={{ color: active ? finish?.hex : "hsl(var(--muted-foreground))" }}
                >
                  {finish?.name}
                </span>
                <span className="num flex items-center gap-1 text-[10px] text-muted-foreground">
                  {entry.status === "mastered" ? (
                    <>
                      <Crown className="h-3 w-3 text-[#ffd83d]" /> Mastered
                    </>
                  ) : entry.status === "collected" ? (
                    `Lv ${entry.level}`
                  ) : (
                    "Missing"
                  )}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

/** Header block used above both a friend's board and the compare view. */
export function FriendHeadline({
  username,
  collected,
  mastered,
  total,
  showcase,
}: {
  username: string;
  collected: number;
  mastered: number;
  total: number;
  showcase: ShowcasePick[];
}) {
  return (
    <div className="mx-4 mt-3 rounded-2xl border border-card-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-[15px] font-bold uppercase text-primary">
          {username.slice(0, 2)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold" data-testid="text-friend-username">
            @{username}
          </p>
          <p className="num text-[11px] text-muted-foreground" data-testid="text-friend-summary">
            {collected}/{total} collected · {mastered} mastered
          </p>
        </div>
      </div>
      <div className="mt-3 border-t border-border pt-3">
        <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Showcase
        </p>
        <div className="mt-2">
          <ShowcaseStrip
            items={showcase}
            testId="strip-friend-showcase"
            emptyLabel={`@${username} has not pinned any favourites yet.`}
          />
        </div>
      </div>
    </div>
  );
}
