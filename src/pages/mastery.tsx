import { useLocation } from "wouter";
import { Crown, Flame } from "lucide-react";
import { AppHeader, GuestBanner, RosterFooter } from "@/components/Chrome";
import { PodTile } from "@/components/PodTile";
import { MilestoneList } from "@/components/Stats";
import { useStore } from "@/lib/store";
import { allVariants, finishById, getVariant, nextMilestone, totals } from "@/lib/roster";
import { Skeleton } from "@/components/ui/skeleton";

export default function MasteryPage() {
  const { roster, rosterLoading, progress, setVariant } = useStore();
  const [, navigate] = useLocation();

  if (rosterLoading || !roster) {
    return (
      <div className="pb-28">
        <AppHeader />
        <div className="space-y-3 p-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const t = totals(roster, progress);
  const next = nextMilestone(roster, t.mastered);
  const variants = allVariants(roster);
  const mastered = variants.filter(
    (v) => getVariant(progress, v.spriteId, v.finishId).status === "mastered",
  );
  const almost = variants
    .map((v) => ({ ...v, entry: getVariant(progress, v.spriteId, v.finishId) }))
    .filter((v) => v.entry.status === "collected" && v.entry.level >= 4)
    .sort((a, b) => b.entry.level - a.entry.level);

  const byFinish = roster.finishes
    .map((f) => {
      const total = variants.filter((v) => v.finishId === f.id).length;
      const done = mastered.filter((v) => v.finishId === f.id).length;
      return { finish: f, total, done };
    })
    .filter((r) => r.total > 0);

  return (
    <div className="pb-28">
      <AppHeader subtitle="Mastery track & finish bonuses" />
      <GuestBanner onCreateAccount={() => navigate("/auth")} />

      <section className="px-4 pt-3">
        <div className="rounded-2xl border border-card-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-[#ffd83d]" />
            <h2 className="text-[13px] font-bold uppercase tracking-wider">Mastered variants</h2>
          </div>
          <p className="num mt-2 text-xl font-bold leading-none" data-testid="text-mastery-count">
            {t.mastered}
            <span className="text-[13px] font-semibold text-muted-foreground">/{t.total}</span>
          </p>
          <p className="num mt-1 text-[11px] text-muted-foreground" data-testid="text-mastery-next">
            {next
              ? `${next.count - t.mastered} more to unlock: ${next.reward}`
              : "Every mastery milestone unlocked."}
          </p>
        </div>
      </section>

      <section className="mt-4 px-4">
        <h2 className="text-[13px] font-bold uppercase tracking-wider">Milestone rewards</h2>
        <div className="mt-2.5">
          <MilestoneList roster={roster} mastered={t.mastered} />
        </div>
      </section>

      <section className="mt-5 px-4">
        <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider">
          <Flame className="h-4 w-4 text-accent" /> Almost there
        </h2>
        <p className="num mt-1 text-[11px] text-muted-foreground">
          Level 4-5 variants that are one push from mastery ({almost.length}).
        </p>
        {almost.length === 0 ? (
          <p
            className="mt-2.5 rounded-2xl border border-card-border bg-card p-4 text-[12px] text-muted-foreground"
            data-testid="text-almost-empty"
          >
            Nothing at level 4 or 5 yet. Level variants up on the Collection tab.
          </p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {almost.map((v) => {
              const sprite = roster.sprites.find((s) => s.id === v.spriteId)!;
              const finish = finishById(roster, v.finishId);
              return (
                <li
                  key={`${v.spriteId}-${v.finishId}`}
                  className="flex items-center gap-2.5 rounded-2xl border border-card-border bg-card p-2.5"
                  data-testid={`row-almost-${v.spriteId}-${v.finishId}`}
                >
                  <PodTile spriteId={v.spriteId} finishId={v.finishId} size={40} status="collected" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold">
                      {sprite.name.replace(" Sprite", "")}{" "}
                      <span style={{ color: finish?.hex }}>{finish?.name}</span>
                    </p>
                    <p className="num text-[10.5px] text-muted-foreground">Level {v.entry.level} of 5</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVariant(v.spriteId, v.finishId, "mastered", 5)}
                    data-testid={`button-master-quick-${v.spriteId}-${v.finishId}`}
                    className="tap shrink-0 rounded-lg border border-[#ffd83d]/50 bg-[#ffd83d]/10 px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-[#ffd83d] active:scale-95"
                  >
                    Master
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-5 px-4">
        <h2 className="text-[13px] font-bold uppercase tracking-wider">Mastery by finish</h2>
        <ul className="mt-2.5 space-y-2">
          {byFinish.map(({ finish, total, done }) => (
            <li
              key={finish.id}
              className="rounded-2xl border border-card-border bg-card p-3"
              data-testid={`row-finish-${finish.id}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="text-[11.5px] font-bold uppercase tracking-wider"
                  style={{ color: finish.hex }}
                >
                  {finish.name}
                </span>
                <span className="num shrink-0 text-[11.5px] font-bold">
                  {done}
                  <span className="text-muted-foreground">/{total}</span>
                </span>
              </div>
              <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{finish.bonus}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${total ? (done / total) * 100 : 0}%`,
                    background: finish.hex,
                    transition: "width 420ms cubic-bezier(0.22,1,0.36,1)",
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {mastered.length > 0 && (
        <section className="mt-5 px-4">
          <h2 className="text-[13px] font-bold uppercase tracking-wider">Your crowned pods</h2>
          <div className="mt-2.5 grid grid-cols-5 gap-2" data-testid="grid-mastered">
            {mastered.map((v) => (
              <PodTile
                key={`m-${v.spriteId}-${v.finishId}`}
                spriteId={v.spriteId}
                finishId={v.finishId}
                size={58}
                status="mastered"
                className="w-full"
              />
            ))}
          </div>
        </section>
      )}

      <RosterFooter />
    </div>
  );
}
