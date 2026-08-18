import { useLocation } from "wouter";
import { AlertTriangle, ChevronRight, Clock, Sparkles } from "lucide-react";
import { AppHeader, GuestBanner, RosterFooter, SeasonRolloverBanner } from "@/components/Chrome";
import { PodTile } from "@/components/PodTile";
import { BarStat, MilestoneList, StatRing } from "@/components/Stats";
import { useStore } from "@/lib/store";
import {
  daysUntil,
  finishById,
  nextMilestone,
  nextUp,
  rarityHex,
  totals,
} from "@/lib/roster";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomePage() {
  const { roster, rosterLoading, progress, progressLoading, setVariant } = useStore();
  const [, navigate] = useLocation();

  if (rosterLoading || !roster) {
    return (
      <div className="pb-28">
        <AppHeader />
        <div className="space-y-3 p-4">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const t = totals(roster, progress);
  const next = nextMilestone(roster, t.mastered);
  const countdown = daysUntil(roster.season.endsOn);
  const suggestions = nextUp(roster, progress, 8);

  return (
    <div className="pb-28">
      <AppHeader
        subtitle={`Chapter ${roster.season.chapter} Season ${roster.season.season} · ${roster.season.name}`}
      />
      <SeasonRolloverBanner />
      <GuestBanner onCreateAccount={() => navigate("/auth")} />

      <section className="px-4 pt-3">
        <div className="grid grid-cols-3 gap-2">
          <StatRing
            value={t.collected}
            total={t.total}
            label="Collected"
            color="hsl(var(--primary))"
            icon="check"
            testId="text-stat-collected"
          />
          <StatRing
            value={t.mastered}
            total={t.total}
            label="Mastered"
            color="#ffd83d"
            icon="crown"
            testId="text-stat-mastered"
          />
          <StatRing
            value={t.remaining}
            total={t.total}
            label="Still to collect"
            color="hsl(var(--accent))"
            icon="target"
            testId="text-stat-remaining"
          />
        </div>
        {progressLoading && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Loading your pod…</p>
        )}
      </section>

      <section className="mt-4 px-4">
        <div className="rounded-2xl border border-card-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="text-[13px] font-bold uppercase tracking-wider">Season ends</h2>
          </div>
          <p className="num mt-2 text-xl font-bold leading-none" data-testid="text-countdown">
            {countdown.unknown
              ? "Date TBA"
              : countdown.over
                ? "Season over"
                : `${countdown.days}d ${countdown.hours}h`}
          </p>
          <p className="num mt-1 text-[11px] text-muted-foreground">
            {roster.season.endsOn ?? "End date not announced yet"} · Season{" "}
            {roster.season.season} finale
          </p>
          <div
            className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5"
            data-testid="text-reset-notice"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-[11.5px] leading-snug text-foreground">{roster.season.note}</p>
          </div>
        </div>
      </section>

      <section className="mt-4 px-4">
        <div className="space-y-3 rounded-2xl border border-card-border bg-card p-4">
          <BarStat
            label="Collection progress"
            value={t.collected}
            total={t.total}
            color="linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))"
            testId="text-bar-collected"
          />
          <BarStat
            label="Mastery progress"
            value={t.mastered}
            total={t.total}
            color="linear-gradient(90deg, #ffd83d, #ff9d2e)"
            testId="text-bar-mastered"
          />
          <div className="flex items-center justify-between border-t border-border pt-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Almost there (Lv 4-5)
            </span>
            <span className="num text-[12px] font-bold" data-testid="text-stat-almost">
              {t.almost}
            </span>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <div className="flex items-center justify-between px-4">
          <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider">
            <Sparkles className="h-4 w-4 text-primary" /> Next up
          </h2>
          <button
            type="button"
            onClick={() => navigate("/collection")}
            data-testid="button-view-collection"
            className="flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary"
          >
            Collection <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1 px-4 text-[11px] text-muted-foreground">
          Highest drop-rate variants you still need — the realistic farm list.
        </p>
        {suggestions.length === 0 ? (
          <p
            className="mx-4 mt-3 rounded-xl border border-primary/40 bg-primary/10 p-3 text-[12px]"
            data-testid="text-nextup-empty"
          >
            Every variant in the roster is collected. Pod complete — go chase mastery levels.
          </p>
        ) : (
          <ul className="scrollbar-none mt-3 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1">
            {suggestions.map((s) => {
              const finish = finishById(roster, s.finishId);
              return (
                <li key={`${s.spriteId}-${s.finishId}`} className="snap-start">
                  <button
                    type="button"
                    onClick={() => setVariant(s.spriteId, s.finishId, "collected", 1)}
                    data-testid={`button-nextup-${s.spriteId}-${s.finishId}`}
                    className="flex w-[124px] flex-col gap-1.5 rounded-2xl border border-card-border bg-card p-2.5 text-left active:scale-[0.97]"
                  >
                    <PodTile spriteId={s.spriteId} finishId={s.finishId} size={56} status="collected" />
                    <span className="truncate text-[12px] font-semibold leading-tight">
                      {s.sprite.name.replace(" Sprite", "")}
                    </span>
                    <span
                      className="truncate text-[10.5px] font-semibold uppercase tracking-wider"
                      style={{ color: finish?.hex }}
                    >
                      {finish?.name}
                    </span>
                    <span className="num text-[10.5px] text-muted-foreground">
                      {s.sprite.dropRate} drop ·{" "}
                      <span style={{ color: rarityHex(roster, s.sprite.rarity) }}>
                        {s.sprite.rarity}
                      </span>
                    </span>
                    <span className="mt-0.5 rounded-md bg-primary/15 px-1.5 py-1 text-center text-[10px] font-bold uppercase tracking-wider text-primary">
                      Mark collected
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-5 px-4">
        <h2 className="text-[13px] font-bold uppercase tracking-wider">Mastery milestones</h2>
        <p className="num mt-1 text-[11px] text-muted-foreground" data-testid="text-next-milestone">
          {next
            ? `Next reward at ${next.count} mastered — ${next.count - t.mastered} to go: ${next.reward}`
            : "All mastery milestones unlocked."}
        </p>
        <div className="mt-3">
          <MilestoneList roster={roster} mastered={t.mastered} />
        </div>
      </section>

      <RosterFooter />
    </div>
  );
}
