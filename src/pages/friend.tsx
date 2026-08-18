import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Crown, Grid2x2, Scale, UserMinus } from "lucide-react";
import { AppHeader, RosterFooter } from "@/components/Chrome";
import { PodTile } from "@/components/PodTile";
import {
  BackendRequiredCard,
  FriendHeadline,
  ReadOnlyBoard,
  SignInRequiredCard,
} from "@/components/Social";
import { useStore } from "@/lib/store";
import { totals, variantKey, type EntryStatus } from "@/lib/roster";
import {
  compareProgress,
  entriesToProgress,
  useFriendPod,
  useRemoveFriend,
  useSocialReady,
  type CompareRow,
} from "@/lib/social";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type View = "board" | "compare";

export default function FriendPage() {
  const [, params] = useRoute("/friends/:username");
  const username = params?.username ?? null;
  const [, navigate] = useLocation();

  const { roster, progress } = useStore();
  const { backendAvailable, signedIn } = useSocialReady();
  const pod = useFriendPod(username);
  const removeFriend = useRemoveFriend();

  const [view, setView] = useState<View>("board");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const theirProgress = useMemo(
    () => (pod.data ? entriesToProgress(pod.data.entries) : {}),
    [pod.data],
  );
  const comparison = useMemo(
    () => (roster && pod.data ? compareProgress(roster, progress, theirProgress) : null),
    [roster, progress, theirProgress, pod.data],
  );

  const back = (
    <button
      type="button"
      onClick={() => navigate("/friends")}
      data-testid="button-back-to-friends"
      className="tap mx-4 mt-3 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground active:scale-95"
    >
      <ArrowLeft className="h-4 w-4" /> Friends
    </button>
  );

  if (!backendAvailable) {
    return (
      <div className="pb-28">
        <AppHeader subtitle="Friends" />
        <BackendRequiredCard />
        <RosterFooter />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="pb-28">
        <AppHeader subtitle="Friends" />
        <SignInRequiredCard onSignIn={() => navigate("/auth")} />
        <RosterFooter />
      </div>
    );
  }

  if (pod.isLoading || !roster) {
    return (
      <div className="pb-28">
        <AppHeader subtitle="Friends" />
        {back}
        <div className="space-y-2.5 p-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (pod.isError || !pod.data) {
    return (
      <div className="pb-28">
        <AppHeader subtitle="Friends" />
        {back}
        <p
          className="mx-4 mt-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-[12.5px] leading-relaxed"
          data-testid="text-friend-pod-error"
        >
          {pod.error instanceof Error
            ? pod.error.message
            : "Could not load that pod right now. Try again in a moment."}
        </p>
        <RosterFooter />
      </div>
    );
  }

  const t = totals(roster, progress);
  const theirTotals = totals(roster, theirProgress);

  return (
    <div className="pb-28">
      <AppHeader subtitle={`@${pod.data.username}`} />
      {back}

      <FriendHeadline
        username={pod.data.username}
        collected={theirTotals.collected}
        mastered={theirTotals.mastered}
        total={theirTotals.total}
        showcase={pod.data.showcase}
      />

      <div className="mt-3 grid grid-cols-2 gap-2 px-4">
        <SegButton
          active={view === "board"}
          onClick={() => setView("board")}
          testId="button-view-board"
          icon={<Grid2x2 className="h-3.5 w-3.5" />}
          label="Their board"
        />
        <SegButton
          active={view === "compare"}
          onClick={() => setView("compare")}
          testId="button-view-compare"
          icon={<Scale className="h-3.5 w-3.5" />}
          label="Compare"
        />
      </div>

      {view === "board" ? (
        <div className="mt-3">
          <ReadOnlyBoard
            roster={roster}
            progress={theirProgress}
            ownerLabel={`@${pod.data.username}'s board`}
          />
        </div>
      ) : (
        comparison && (
          <CompareView
            theirName={pod.data.username}
            comparison={comparison}
            myMastered={t.mastered}
            myCollected={t.collected}
          />
        )
      )}

      <section className="mt-5 px-4">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          data-testid="button-unfriend"
          className="tap flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-[12px] font-bold uppercase tracking-wider text-muted-foreground active:scale-[0.98]"
        >
          <UserMinus className="h-4 w-4" /> Remove friend
        </button>
      </section>

      <RosterFooter />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="dialog-unfriend-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              Remove @{pod.data.username}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You will both stop seeing each other's boards. Either of you can send a new request
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-unfriend">Keep friend</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-unfriend"
              onClick={() => {
                void removeFriend.mutateAsync(pod.data!.username).finally(() => {
                  setConfirmOpen(false);
                  navigate("/friends");
                });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SegButton({
  active,
  onClick,
  label,
  testId,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testId: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "tap flex items-center justify-center gap-1.5 rounded-xl border text-[11.5px] font-bold uppercase tracking-wider transition-colors active:scale-[0.98]",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground",
      )}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}

function CompareView({
  theirName,
  comparison,
  myCollected,
  myMastered,
}: {
  theirName: string;
  comparison: ReturnType<typeof compareProgress>;
  myCollected: number;
  myMastered: number;
}) {
  const { total } = comparison;
  return (
    <div className="mt-3">
      <section className="px-4">
        <div className="grid grid-cols-2 gap-2">
          <ScoreCard
            title="You"
            collected={myCollected}
            mastered={myMastered}
            total={total}
            accent="hsl(var(--primary))"
            testId="card-score-me"
          />
          <ScoreCard
            title={`@${theirName}`}
            collected={comparison.theirs.collected}
            mastered={comparison.theirs.mastered}
            total={total}
            accent="hsl(var(--accent))"
            testId="card-score-them"
          />
        </div>
        <p className="num mt-2 text-center text-[11px] text-muted-foreground" data-testid="text-compare-verdict">
          {myCollected === comparison.theirs.collected
            ? "Dead even on collection."
            : (() => {
                const gap = Math.abs(myCollected - comparison.theirs.collected);
                const unit = gap === 1 ? "variant" : "variants";
                return myCollected > comparison.theirs.collected
                  ? `You are ahead by ${gap} ${unit}.`
                  : `@${theirName} is ahead by ${gap} ${unit}.`;
              })()}
        </p>
      </section>

      <CompareList
        title="They have, you need"
        subtitle="Proof it drops — go get these."
        rows={comparison.theyHave}
        emptyText={`Nothing. You already have everything @${theirName} does.`}
        side="theirs"
        testId="list-they-have"
      />
      <CompareList
        title="You have, they need"
        subtitle="Your bragging rights."
        rows={comparison.youHave}
        emptyText={`@${theirName} has everything you have.`}
        side="mine"
        testId="list-you-have"
      />
      <CompareList
        title="Mastery gap"
        subtitle="Both collected, one of you has mastered it."
        rows={comparison.masteryGap}
        emptyText="No mastery differences."
        side="both"
        testId="list-mastery-gap"
      />
      <CompareList
        title="Neither of you"
        subtitle="Still missing from both pods."
        rows={comparison.bothMissing}
        emptyText="Between you, the whole roster is covered."
        side="none"
        testId="list-both-missing"
        collapsedByDefault
      />
    </div>
  );
}

function ScoreCard({
  title,
  collected,
  mastered,
  total,
  accent,
  testId,
}: {
  title: string;
  collected: number;
  mastered: number;
  total: number;
  accent: string;
  testId: string;
}) {
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0;
  return (
    <div
      className="rounded-2xl border border-card-border bg-card p-3"
      data-testid={testId}
      style={{ boxShadow: `inset 0 0 0 1px ${accent}33` }}
    >
      <p className="truncate text-[11.5px] font-bold uppercase tracking-wider" style={{ color: accent }}>
        {title}
      </p>
      <p className="num mt-1 text-xl font-bold leading-none">
        {collected}
        <span className="text-[12px] font-semibold text-muted-foreground">/{total}</span>
      </p>
      <p className="num mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Crown className="h-3 w-3 text-[#ffd83d]" /> {mastered} mastered · {pct}%
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: accent }} />
      </div>
    </div>
  );
}

function statusLabel(status: EntryStatus, level: number) {
  if (status === "mastered") return "Mastered";
  if (status === "collected") return `Lv ${level}`;
  return "Missing";
}

function CompareList({
  title,
  subtitle,
  rows,
  emptyText,
  side,
  testId,
  collapsedByDefault = false,
}: {
  title: string;
  subtitle: string;
  rows: CompareRow[];
  emptyText: string;
  side: "mine" | "theirs" | "both" | "none";
  testId: string;
  collapsedByDefault?: boolean;
}) {
  const [expanded, setExpanded] = useState(!collapsedByDefault);
  const accent =
    side === "theirs"
      ? "hsl(var(--accent))"
      : side === "mine"
        ? "hsl(var(--primary))"
        : side === "both"
          ? "#ffd83d"
          : "hsl(var(--muted-foreground))";

  return (
    <section className="mt-4 px-4" data-testid={testId}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-baseline justify-between gap-2 text-left"
        data-testid={`${testId}-toggle`}
        aria-expanded={expanded}
      >
        <h2 className="text-[13px] font-bold uppercase tracking-wider" style={{ color: accent }}>
          {title}
        </h2>
        <span className="num shrink-0 text-[11px] font-bold text-muted-foreground">
          {rows.length} {expanded ? "▲" : "▼"}
        </span>
      </button>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>

      {rows.length === 0 ? (
        <p
          className="mt-2 rounded-2xl border border-card-border bg-card p-3 text-[12px] text-muted-foreground"
          data-testid={`${testId}-empty`}
        >
          {emptyText}
        </p>
      ) : (
        expanded && (
          <ul className="mt-2 space-y-1.5">
            {rows.map((row) => (
              <li
                key={variantKey(row.spriteId, row.finishId)}
                data-testid={`row-compare-${row.spriteId}-${row.finishId}`}
                className="flex items-center gap-2.5 rounded-xl border border-card-border bg-card p-2"
              >
                <PodTile
                  spriteId={row.spriteId}
                  finishId={row.finishId}
                  size={34}
                  status={row.theirs !== "none" ? row.theirs : row.mine}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold leading-tight">
                    {row.sprite.name.replace(" Sprite", "")}
                  </span>
                  <span
                    className="block truncate text-[10.5px] font-bold uppercase tracking-wider"
                    style={{ color: row.finish.hex }}
                  >
                    {row.finish.name}
                  </span>
                </span>
                <span className="num shrink-0 text-right text-[10px] leading-tight">
                  <span className="block text-muted-foreground">
                    you <span className="text-foreground">{statusLabel(row.mine, row.myLevel)}</span>
                  </span>
                  <span className="block text-muted-foreground">
                    them{" "}
                    <span className="text-foreground">{statusLabel(row.theirs, row.theirLevel)}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}
