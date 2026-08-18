import { useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ChevronRight,
  Download,
  LogOut,
  RotateCcw,
  Share,
  ShieldCheck,
  Smartphone,
  Upload,
  Users,
} from "lucide-react";
import { AppHeader, GuestBanner, Logo, RosterFooter } from "@/components/Chrome";
import { ShowcaseEditor } from "@/components/ShowcaseEditor";
import { useStore } from "@/lib/store";
import { totals } from "@/lib/roster";
import { useFriends, useSocialReady } from "@/lib/social";
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

export default function ProfilePage() {
  const {
    roster,
    mode,
    username,
    progress,
    logout,
    resetSeason,
    syncing,
    backendAvailable,
    exportProgress,
    importProgress,
    archivedSeasons,
    exportArchivedSeason,
  } = useStore();
  const [, navigate] = useLocation();
  const { ready: socialReady } = useSocialReady();
  const friendsQuery = useFriends();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [backupNote, setBackupNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const t = roster ? totals(roster, progress) : null;

  const downloadBackup = () => {
    const blob = new Blob([exportProgress()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sprite-pod-${roster?.season.id ?? "backup"}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupNote("Backup file saved.");
  };

  const downloadArchived = (seasonId: string) => {
    const blob = new Blob([exportArchivedSeason(seasonId)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sprite-pod-${seasonId}-archive.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const restoreBackup = async (file: File) => {
    try {
      const merged = importProgress(await file.text());
      setBackupNote(
        merged > 0 ? `Restored ${merged} variants.` : "That backup had nothing to restore.",
      );
    } catch (err) {
      setBackupNote(err instanceof Error ? err.message : "Could not read that file.");
    }
  };

  return (
    <div className="pb-28">
      <AppHeader subtitle="Pod settings" />
      <GuestBanner onCreateAccount={() => navigate("/auth")} />

      <section className="px-4 pt-3">
        <div className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Logo size={26} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold" data-testid="text-profile-username">
              {mode === "user"
                ? `@${username}`
                : backendAvailable
                  ? mode === "guest"
                    ? "Guest pod"
                    : "Not signed in"
                  : "My pod (this device)"}
            </p>
            <p className="num text-[11px] text-muted-foreground" data-testid="text-profile-summary">
              {t
                ? `${t.collected}/${t.total} collected · ${t.mastered} mastered`
                : "Loading roster…"}
            </p>
          </div>
        </div>
      </section>

      {mode !== "user" && backendAvailable && (
        <section className="mt-3 px-4">
          <button
            type="button"
            onClick={() => navigate("/auth")}
            data-testid="button-goto-auth"
            className="tap flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-[12.5px] font-bold uppercase tracking-wider text-primary-foreground active:scale-[0.98]"
          >
            <ShieldCheck className="h-4 w-4" /> Create account / sign in to sync
          </button>
        </section>
      )}

      {socialReady && (
        <section className="mt-3 px-4">
          <button
            type="button"
            onClick={() => navigate("/friends")}
            data-testid="button-goto-friends"
            className="tap flex w-full items-center gap-3 rounded-2xl border border-card-border bg-card p-3 text-left active:scale-[0.99]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Users className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold">Friends</span>
              <span
                className="num block text-[11px] text-muted-foreground"
                data-testid="text-profile-friends-summary"
              >
                {friendsQuery.data
                  ? `${friendsQuery.data.friends.length} friend${
                      friendsQuery.data.friends.length === 1 ? "" : "s"
                    }${
                      friendsQuery.data.incoming.length > 0
                        ? ` · ${friendsQuery.data.incoming.length} request${
                            friendsQuery.data.incoming.length === 1 ? "" : "s"
                          } waiting`
                        : ""
                    }`
                  : "Compare boards and swap notes"}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </section>
      )}

      <ShowcaseEditor />

      <section className="mt-4 px-4">
        <h2 className="text-[13px] font-bold uppercase tracking-wider">Install on iPhone</h2>
        <ol className="mt-2 space-y-1.5 rounded-2xl border border-card-border bg-card p-4 text-[12px] leading-relaxed text-muted-foreground">
          <li className="flex gap-2">
            <Share className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Tap Share in Safari
          </li>
          <li className="flex gap-2">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Choose “Add to Home
            Screen” — Sprite Pod opens full-screen and works offline.
          </li>
        </ol>
      </section>

      {archivedSeasons.length > 0 && (
        <section className="mt-4 px-4">
          <h2 className="text-[13px] font-bold uppercase tracking-wider">Past seasons</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
            Sprites reset each season. Here is what you finished with.
          </p>
          <div className="mt-2 space-y-2">
            {archivedSeasons.map((s) => (
              <div
                key={s.seasonId}
                className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-3"
                data-testid={`row-archived-${s.seasonId}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold uppercase tracking-wider">
                    {s.seasonName}
                  </p>
                  <p className="num text-[11.5px] text-muted-foreground">
                    {s.collected} collected · {s.mastered} mastered
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadArchived(s.seasonId)}
                  data-testid={`button-export-archived-${s.seasonId}`}
                  aria-label={`Export ${s.seasonName} progress`}
                  className="tap shrink-0 rounded-xl border border-border bg-background px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-foreground active:scale-[0.98]"
                >
                  <Download className="h-4 w-4 text-primary" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-4 px-4">
        <h2 className="text-[13px] font-bold uppercase tracking-wider">Backup</h2>
        <div className="mt-2 rounded-2xl border border-card-border bg-card p-4">
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            {backendAvailable
              ? "Save a copy of your pod as a file, or restore one from another device."
              : "This build stores progress in this browser only. Save a backup file before clearing browsing data or switching phones."}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={downloadBackup}
              data-testid="button-export-progress"
              className="tap flex items-center justify-center gap-2 rounded-xl border border-border bg-background text-[12px] font-bold uppercase tracking-wider text-foreground active:scale-[0.98]"
            >
              <Download className="h-4 w-4 text-primary" /> Export
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              data-testid="button-import-progress"
              className="tap flex items-center justify-center gap-2 rounded-xl border border-border bg-background text-[12px] font-bold uppercase tracking-wider text-foreground active:scale-[0.98]"
            >
              <Upload className="h-4 w-4 text-primary" /> Restore
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void restoreBackup(f);
              e.target.value = "";
            }}
          />
          {backupNote && (
            <p className="mt-2 text-[11.5px] text-primary" data-testid="text-backup-note">
              {backupNote}
            </p>
          )}
        </div>
      </section>

      <section className="mt-4 px-4">
        <h2 className="text-[13px] font-bold uppercase tracking-wider">Season</h2>
        <div className="mt-2 rounded-2xl border border-card-border bg-card p-4">
          <p className="num text-[12px] font-semibold">
            {roster
              ? `Chapter ${roster.season.chapter} Season ${roster.season.season} · ${roster.season.name}`
              : "—"}
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
            {roster?.season.note}
          </p>
        </div>
      </section>

      <section className="mt-4 space-y-2 px-4">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={syncing}
          data-testid="button-reset-season"
          className="tap flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 text-[12.5px] font-bold uppercase tracking-wider text-destructive active:scale-[0.98] disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" /> Reset season progress
        </button>
        {mode === "user" && (
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/auth");
            }}
            data-testid="button-logout"
            className="tap flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground active:scale-[0.98]"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        )}
      </section>

      <RosterFooter />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="dialog-reset-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Reset this season?</AlertDialogTitle>
            <AlertDialogDescription>
              Every collected and mastered variant for{" "}
              {roster ? `Chapter ${roster.season.chapter} Season ${roster.season.season}` : "this season"}{" "}
              will be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reset">Keep my pod</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-reset"
              onClick={() => {
                resetSeason();
                setConfirmOpen(false);
              }}
            >
              Reset everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
