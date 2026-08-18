import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ChevronDown, Crown, Minus, Plus, Search, X } from "lucide-react";
import { AppHeader, GuestBanner, RosterFooter } from "@/components/Chrome";
import { PodTile } from "@/components/PodTile";
import { useStore } from "@/lib/store";
import {
  finishById,
  getVariant,
  groupStats,
  nextStatus,
  rarityHex,
  variantKey,
  type EntryStatus,
  type Roster,
  type Sprite,
} from "@/lib/roster";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type FilterId = "all" | "need" | "collected" | "mastered" | "almost";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "need", label: "Need to collect" },
  { id: "collected", label: "Collected" },
  { id: "mastered", label: "Mastered" },
  { id: "almost", label: "Almost there" },
];

function matchesFilter(filter: FilterId, e: { status: EntryStatus; level: number }) {
  switch (filter) {
    case "need":
      return e.status === "none";
    case "collected":
      return e.status === "collected";
    case "mastered":
      return e.status === "mastered";
    case "almost":
      return e.status === "collected" && e.level >= 4;
    default:
      return true;
  }
}

function VariantChip({
  sprite,
  finishId,
  roster,
  onLongPress,
}: {
  sprite: Sprite;
  finishId: string;
  roster: Roster;
  onLongPress: () => void;
}) {
  const { progress, setVariant } = useStore();
  const entry = getVariant(progress, sprite.id, finishId);
  const finish = finishById(roster, finishId);
  const [bump, setBump] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const cycle = () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    const ns = nextStatus(entry.status);
    setBump((n) => n + 1);
    setVariant(sprite.id, finishId, ns, ns === "collected" ? entry.level : 1);
  };

  const startPress = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      onLongPress();
    }, 450);
  };
  const endPress = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  const active = entry.status !== "none";
  return (
    <button
      type="button"
      onClick={cycle}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onContextMenu={(e) => e.preventDefault()}
      data-testid={`button-variant-${sprite.id}-${finishId}`}
      data-status={entry.status}
      className={cn(
        "tap flex select-none items-center gap-1.5 rounded-xl border px-1.5 py-1 text-left transition-transform active:scale-[0.94]",
        active ? "bg-white/[0.04]" : "bg-background/60",
      )}
      style={{
        borderColor: active ? `${finish?.hex}99` : "hsl(var(--border))",
        boxShadow: active ? `0 0 12px -4px ${finish?.hex}80` : undefined,
      }}
      aria-label={`${sprite.name} ${finish?.name} — ${entry.status}`}
    >
      <PodTile
        spriteId={sprite.id}
        finishId={finishId}
        size={30}
        status={entry.status}
        animateKey={bump}
      />
      <span className="flex min-w-0 flex-col leading-tight">
        <span
          className="truncate text-[10.5px] font-bold uppercase tracking-wide"
          style={{ color: active ? finish?.hex : "hsl(var(--muted-foreground))" }}
        >
          {finish?.name}
        </span>
        <span className="num text-[10px] text-muted-foreground" data-testid={`text-variant-state-${sprite.id}-${finishId}`}>
          {entry.status === "mastered"
            ? "Mastered"
            : entry.status === "collected"
              ? `Lv ${entry.level}`
              : "Missing"}
        </span>
      </span>
    </button>
  );
}

function LevelStepper({ sprite, finishId, roster }: { sprite: Sprite; finishId: string; roster: Roster }) {
  const { progress, setVariant } = useStore();
  const entry = getVariant(progress, sprite.id, finishId);
  const finish = finishById(roster, finishId);
  if (entry.status !== "collected") return null;
  return (
    <div
      className="rounded-xl border border-card-border bg-background/60 p-2.5"
      data-testid={`panel-level-${sprite.id}-${finishId}`}
    >
      <div className="flex items-center gap-2">
        <PodTile spriteId={sprite.id} finishId={finishId} size={34} status="collected" />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-bold uppercase tracking-wide" style={{ color: finish?.hex }}>
            {finish?.name}
          </p>
          <p className="text-[10.5px] leading-snug text-muted-foreground">{finish?.bonus}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setVariant(sprite.id, finishId, "collected", Math.max(1, entry.level - 1))}
          disabled={entry.level <= 1}
          data-testid={`button-level-down-${sprite.id}-${finishId}`}
          className="tap flex items-center justify-center rounded-lg border border-border bg-card px-2 disabled:opacity-40 active:scale-95"
          aria-label="Decrease level"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="flex flex-1 gap-1">
          {[1, 2, 3, 4, 5].map((lv) => (
            <button
              key={lv}
              type="button"
              onClick={() => setVariant(sprite.id, finishId, "collected", lv)}
              data-testid={`button-level-set-${sprite.id}-${finishId}-${lv}`}
              className={cn(
                "num h-9 flex-1 rounded-lg border text-[11px] font-bold transition-colors",
                lv <= entry.level
                  ? "border-transparent text-primary-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
              style={lv <= entry.level ? { background: "hsl(var(--primary))" } : undefined}
              aria-label={`Set level ${lv}`}
            >
              {lv}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setVariant(sprite.id, finishId, "collected", Math.min(5, entry.level + 1))}
          disabled={entry.level >= 5}
          data-testid={`button-level-up-${sprite.id}-${finishId}`}
          className="tap flex items-center justify-center rounded-lg border border-border bg-card px-2 disabled:opacity-40 active:scale-95"
          aria-label="Increase level"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => setVariant(sprite.id, finishId, "mastered", 5)}
        data-testid={`button-master-${sprite.id}-${finishId}`}
        className="tap mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#ffd83d]/50 bg-[#ffd83d]/10 text-[11px] font-bold uppercase tracking-wider text-[#ffd83d] active:scale-[0.98]"
      >
        <Crown className="h-3.5 w-3.5" /> Mark mastered
      </button>
    </div>
  );
}

function SpriteCard({
  sprite,
  roster,
  visibleFinishes,
  openDefault,
}: {
  sprite: Sprite;
  roster: Roster;
  visibleFinishes: string[];
  openDefault: boolean;
}) {
  const { progress } = useStore();
  const [open, setOpen] = useState(openDefault);
  const stats = groupStats(sprite, progress);
  const collectedNotMastered = sprite.finishes.filter(
    (f) => getVariant(progress, sprite.id, f).status === "collected",
  );

  return (
    <article
      className="rounded-2xl border border-card-border bg-card p-3"
      data-testid={`card-sprite-${sprite.id}`}
    >
      <div className="flex items-start gap-3">
        <PodTile
          spriteId={sprite.id}
          finishId={stats.mastered > 0 ? "gold" : "normal"}
          size={48}
          status={stats.collected > 0 ? (stats.mastered > 0 ? "mastered" : "collected") : "none"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-bold" data-testid={`text-sprite-name-${sprite.id}`}>
              {sprite.name}
            </h3>
            <span
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
              style={{
                color: rarityHex(roster, sprite.rarity),
                background: `${rarityHex(roster, sprite.rarity)}22`,
                boxShadow: `inset 0 0 0 1px ${rarityHex(roster, sprite.rarity)}55`,
              }}
              data-testid={`chip-rarity-${sprite.id}`}
            >
              {sprite.rarity}
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{sprite.ability}</p>
          <p className="num mt-1 text-[10.5px] font-semibold text-muted-foreground" data-testid={`text-group-stats-${sprite.id}`}>
            {stats.collected}/{stats.total} collected · {stats.mastered} mastered · drop{" "}
            {sprite.dropRate}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          data-testid={`button-expand-${sprite.id}`}
          className="tap -mr-1 flex items-center justify-center rounded-lg px-1 text-muted-foreground active:scale-95"
          aria-expanded={open}
          aria-label="Toggle levels and bonuses"
        >
          <ChevronDown className={cn("h-5 w-5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {visibleFinishes.map((f) => (
          <VariantChip
            key={variantKey(sprite.id, f)}
            sprite={sprite}
            finishId={f}
            roster={roster}
            onLongPress={() => setOpen(true)}
          />
        ))}
      </div>

      {open && (
        <div className="mt-2.5 space-y-2">
          {collectedNotMastered.length === 0 ? (
            <p className="rounded-xl border border-border bg-background/50 p-2.5 text-[11px] text-muted-foreground">
              Tap a variant to mark it collected — level steppers and finish bonuses appear here.
            </p>
          ) : (
            collectedNotMastered.map((f) => (
              <LevelStepper key={`lv-${sprite.id}-${f}`} sprite={sprite} finishId={f} roster={roster} />
            ))
          )}
        </div>
      )}
    </article>
  );
}

export default function CollectionPage() {
  const { roster, rosterLoading, progress } = useStore();
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<FilterId>("all");
  const [rarity, setRarity] = useState<string>("all");
  const [finish, setFinish] = useState<string>("all");
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    if (!roster) return [];
    const q = search.trim().toLowerCase();
    return roster.sprites
      .filter((s) => rarity === "all" || s.rarity === rarity)
      .filter(
        (s) =>
          q === "" ||
          s.name.toLowerCase().includes(q) ||
          s.ability.toLowerCase().includes(q) ||
          s.rarity.toLowerCase().includes(q),
      )
      .map((s) => {
        const visible = s.finishes
          .filter((f) => finish === "all" || f === finish)
          .filter((f) => matchesFilter(filter, getVariant(progress, s.id, f)));
        return { sprite: s, visible };
      })
      .filter((g) => g.visible.length > 0);
  }, [roster, progress, filter, rarity, finish, search]);

  if (rosterLoading || !roster) {
    return (
      <div className="pb-28">
        <AppHeader />
        <div className="space-y-3 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const shownVariants = groups.reduce((n, g) => n + g.visible.length, 0);
  const totalVariants = roster.sprites.reduce((n, s) => n + s.finishes.length, 0);

  return (
    <div className="pb-28">
      <AppHeader subtitle={`${roster.sprites.length} sprites · ${totalVariants} variants`} />
      <GuestBanner onCreateAccount={() => navigate("/auth")} />

      <div className="sticky top-[58px] z-20 space-y-2 border-b border-border/70 bg-background/92 px-4 py-2.5 backdrop-blur-xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sprites or abilities"
            data-testid="input-search"
            className="tap w-full rounded-xl border border-input bg-card pl-9 pr-9 text-[13px] outline-none focus:border-primary"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              data-testid="button-clear-search"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="scrollbar-none fade-x -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              data-testid={`button-filter-${f.id}`}
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

        <div className="scrollbar-none fade-x -mx-1 flex gap-1.5 overflow-x-auto px-1">
          <FilterPill
            active={rarity === "all"}
            onClick={() => setRarity("all")}
            testId="button-rarity-all"
            label="Any rarity"
          />
          {roster.rarities.map((r) => (
            <FilterPill
              key={r.id}
              active={rarity === r.id}
              onClick={() => setRarity(r.id)}
              testId={`button-rarity-${r.id}`}
              label={r.id}
              color={r.hex}
            />
          ))}
        </div>

        <div className="scrollbar-none fade-x -mx-1 flex gap-1.5 overflow-x-auto px-1">
          <FilterPill
            active={finish === "all"}
            onClick={() => setFinish("all")}
            testId="button-finish-all"
            label="Any finish"
          />
          {roster.finishes.map((f) => (
            <FilterPill
              key={f.id}
              active={finish === f.id}
              onClick={() => setFinish(f.id)}
              testId={`button-finish-${f.id}`}
              label={f.name}
              color={f.hex}
            />
          ))}
        </div>
      </div>

      <p className="num px-4 pt-2.5 text-[11px] text-muted-foreground" data-testid="text-result-count">
        Showing {shownVariants} of {totalVariants} variants across {groups.length} sprite groups
      </p>

      <div className="mt-2 space-y-2.5 px-4">
        {groups.length === 0 ? (
          <p
            className="rounded-2xl border border-card-border bg-card p-5 text-center text-[12.5px] text-muted-foreground"
            data-testid="text-empty-collection"
          >
            No variants match these filters. Try clearing the search or switching back to All.
          </p>
        ) : (
          groups.map((g) => (
            <SpriteCard
              key={g.sprite.id}
              sprite={g.sprite}
              roster={roster}
              visibleFinishes={g.visible}
              openDefault={false}
            />
          ))
        )}
      </div>

      <RosterFooter />
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  testId,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testId: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors",
        active ? "text-foreground" : "border-border bg-card text-muted-foreground",
      )}
      style={
        active
          ? {
              borderColor: color ?? "hsl(var(--primary))",
              background: `${color ?? "hsl(var(--primary))"}22`,
            }
          : undefined
      }
    >
      {color && (
        <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
