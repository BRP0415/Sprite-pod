import { useState } from "react";
import { useLocation } from "wouter";
import { HardDrive, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { Logo } from "@/components/Chrome";
import { PodTile } from "@/components/PodTile";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function AuthPage() {
  const {
    register,
    login,
    playAsGuest,
    roster,
    rosterLoading,
    guestEntryCount,
    mode,
    backendAvailable,
  } = useStore();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"login" | "register">(mode === "guest" ? "register" : "login");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
      setError("Username must be 3-20 letters, numbers or underscores");
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN must be 4-6 digits");
      return;
    }
    setBusy(true);
    try {
      if (tab === "register") await register(username.trim(), pin);
      else await login(username.trim(), pin);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const showcase = roster?.sprites.slice(0, 4) ?? [];
  const preferred = ["gold", "galaxy", "holofoil", "gummy"];
  /* Pick a finish each showcase Sprite actually has, so no tile 404s. */
  const showcaseFinish = (spriteFinishes: string[], i: number) =>
    spriteFinishes.includes(preferred[i % preferred.length])
      ? preferred[i % preferred.length]
      : (spriteFinishes[1] ?? spriteFinishes[0] ?? "normal");

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pb-10 pt-10 safe-top">
      <div className="flex items-center gap-3">
        <span className="text-primary">
          <Logo size={38} />
        </span>
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.16em]">Sprite Pod</h1>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {roster
              ? `C${roster.season.chapter} S${roster.season.season} · ${roster.season.name}`
              : "Collection & mastery tracker"}
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        {showcase.map((s, i) => (
          <PodTile
            key={s.id}
            spriteId={s.id}
            finishId={showcaseFinish(s.finishes, i)}
            size={62}
            status="collected"
          />
        ))}
      </div>

      <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">
        {backendAvailable || rosterLoading
          ? "Track every Sprite variant you have collected and mastered this season. Progress syncs to your pod with just a username and a PIN — no email needed."
          : "Track every Sprite variant you have collected and mastered this season. This build runs without a server, so your progress is saved on this device."}
      </p>

      {!backendAvailable && !rosterLoading && (
        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-foreground">
            <HardDrive className="h-4 w-4 text-primary" />
            <span className="text-[12px] font-bold uppercase tracking-wider">
              Saved on this device
            </span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            No account server is connected to this build, so there is nothing to sign in to. Your
            collection is stored in this browser and stays put between visits. To sync one pod
            across several devices, point the app at a backend with{" "}
            <code className="rounded bg-background px-1 py-0.5 text-[11px]">VITE_API_BASE</code> —
            the README covers it.
          </p>
          <button
            type="button"
            onClick={() => {
              playAsGuest();
              navigate("/");
            }}
            data-testid="button-start-local"
            className="tap mt-3 w-full rounded-xl bg-primary text-[13px] font-bold uppercase tracking-wider text-primary-foreground transition-transform active:scale-[0.98]"
          >
            Start tracking
          </button>
        </div>
      )}

      {/* Hold the sign-in form back until the backend probe settles, so a
          static build never flashes an account form it cannot use. */}
      {rosterLoading && (
        <div className="mt-6 space-y-2">
          <div className="h-11 animate-pulse rounded-xl bg-card" />
          <div className="h-11 animate-pulse rounded-xl bg-card" />
        </div>
      )}

      {backendAvailable && !rosterLoading && (
      <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1">
        {(["login", "register"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            data-testid={`button-tab-${t}`}
            className={cn(
              "tap rounded-lg text-[12px] font-bold uppercase tracking-wider transition-colors",
              tab === t
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "login" ? "Sign in" : "Create pod"}
          </button>
        ))}
      </div>
      )}

      {backendAvailable && !rosterLoading && (
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Username
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="looterlynx"
            data-testid="input-username"
            className="tap mt-1 w-full rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            PIN (4-6 digits)
          </span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            type="password"
            autoComplete="off"
            placeholder="••••"
            data-testid="input-pin"
            className="num tap mt-1 w-full rounded-xl border border-input bg-background px-3 text-[15px] tracking-[0.4em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </label>

        {error && (
          <p
            className="rounded-lg border border-destructive/50 bg-destructive/15 px-3 py-2 text-[12px] font-medium text-foreground"
            data-testid="text-auth-error"
          >
            {error}
          </p>
        )}

        {mode === "guest" && guestEntryCount > 0 && (
          <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[12px] text-muted-foreground num">
            {guestEntryCount} guest variant{guestEntryCount === 1 ? "" : "s"} on this device will be
            copied into your account.
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          data-testid="button-auth-submit"
          className="tap flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-[13px] font-bold uppercase tracking-wider text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : tab === "register" ? (
            <UserPlus className="h-4 w-4" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {tab === "register" ? "Create my pod" : "Sign in"}
        </button>
      </form>
      )}

      {backendAvailable && !rosterLoading && (
      <button
        type="button"
        onClick={() => {
          playAsGuest();
          navigate("/");
        }}
        data-testid="button-play-guest"
        className="tap mt-3 w-full rounded-xl border border-border bg-card text-[12px] font-semibold uppercase tracking-wider text-muted-foreground active:scale-[0.98]"
      >
        Play as guest on this device
      </button>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        {backendAvailable
          ? "Guest progress stays on this device only. Add Sprite Pod to your home screen for the full-screen experience."
          : "Add Sprite Pod to your home screen for the full-screen experience."}
      </p>
    </div>
  );
}
