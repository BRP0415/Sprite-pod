import { Link, useLocation } from "wouter";
import { Home, Grid2x2, Crown, User, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useFriends } from "@/lib/social";

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-label="Sprite Pod logo"
      role="img"
      className={className}
    >
      <path
        d="M16 2.5 27.5 9v14L16 29.5 4.5 23V9Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M16 9.5c4.2 0 6.5 2.8 6.5 6.6S20.2 22.5 16 22.5 9.5 19.9 9.5 16 11.8 9.5 16 9.5Z" fill="currentColor" opacity="0.9" />
      <circle cx="13.5" cy="15.4" r="1.5" fill="#0a0c12" />
      <circle cx="18.6" cy="15.4" r="1.5" fill="#0a0c12" />
    </svg>
  );
}

export function AppHeader({ subtitle }: { subtitle?: string }) {
  const { mode, username, backendAvailable } = useStore();
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-border/70 bg-background/85 px-4 pb-3 backdrop-blur-xl">
      <div className="flex items-center gap-2.5">
        <span className="text-primary">
          <Logo size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold uppercase tracking-[0.14em]">Sprite Pod</h1>
          {subtitle && (
            <p className="truncate text-[11px] text-muted-foreground" data-testid="text-header-subtitle">
              {subtitle}
            </p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          data-testid="text-account-chip"
        >
          {mode === "user"
            ? `@${username}`
            : backendAvailable
              ? mode === "guest"
                ? "Guest"
                : "Signed out"
              : "On device"}
        </span>
      </div>
    </header>
  );
}

const TABS = [
  { href: "/", label: "Home", icon: Home, id: "home" },
  { href: "/collection", label: "Collect", icon: Grid2x2, id: "collection" },
  { href: "/mastery", label: "Mastery", icon: Crown, id: "mastery" },
  { href: "/friends", label: "Friends", icon: Users, id: "friends" },
  { href: "/profile", label: "Profile", icon: User, id: "profile" },
];

export function TabBar() {
  const [location] = useLocation();
  // Only the Friends tab uses this, but the tab bar is always mounted, so the
  // pending-request badge stays live wherever you are in the app.
  const { data: friendsData } = useFriends();
  const pending = friendsData?.incoming.length ?? 0;

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/[0.97] pt-1 backdrop-blur-xl">
      <ul className="mx-auto flex max-w-2xl items-stretch justify-between px-1.5">
        {TABS.map((tab) => {
          const active =
            tab.href === "/" ? location === "/" : location === tab.href || location.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          const badge = tab.id === "friends" ? pending : 0;
          return (
            <li key={tab.id} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                data-testid={`link-tab-${tab.id}`}
                className={cn(
                  "tap flex flex-col items-center justify-center gap-1 whitespace-nowrap rounded-xl px-0.5 py-1.5 text-[9.5px] font-semibold uppercase tracking-wide transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-11 items-center justify-center rounded-lg transition-all",
                    active ? "bg-primary/15 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35)]" : "",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 2} />
                  {badge > 0 && (
                    <span
                      data-testid="badge-friend-requests"
                      className="num absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-background"
                    >
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function RosterFooter() {
  const { roster } = useStore();
  if (!roster) return null;
  return (
    <footer className="px-4 pt-2 pb-2 text-[11px] leading-relaxed text-muted-foreground" data-testid="text-roster-footer">
      <p className="num">
        Roster · updated {roster.season.dataVersion} · {roster.sprites.length} sprites ·{" "}
        {roster.sprites.reduce((n, s) => n + s.finishes.length, 0)} variants
      </p>
      <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
        <span>Sources:</span>
        {roster.season.sources.map((src, i) => {
          let label = src;
          try {
            label = new URL(src).hostname.replace(/^www\./, "");
          } catch {
            /* keep raw */
          }
          return (
            <a
              key={src}
              href={src}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-dotted underline-offset-2 hover:text-primary"
              data-testid={`link-source-${i}`}
            >
              {label}
            </a>
          );
        })}
      </p>
      <p className="mt-1.5 opacity-70">
        Fan-made tracker. Sprite icons are from the Fortnite game files and remain the property of Epic Games. Not affiliated with or endorsed by Epic Games.
      </p>
    </footer>
  );
}

/**
 * Shown once after a new season resets the board. Without this the reset
 * looks like lost data, so it names the season and points at the archive.
 */
export function SeasonRolloverBanner() {
  const { seasonRollover, dismissSeasonRollover } = useStore();
  if (!seasonRollover) return null;
  const { toSeasonName, archivedCollected, archivedMastered } = seasonRollover;
  return (
    <div
      className="mx-4 mb-3 rounded-xl border border-primary/45 bg-primary/10 p-3"
      data-testid="banner-season-rollover"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 text-[12px] leading-snug">
          <p className="font-semibold text-foreground">{toSeasonName} is here</p>
          <p className="num text-muted-foreground">
            {archivedCollected > 0
              ? `Sprites don't carry over, so your board is fresh. Last season's ${archivedCollected} collected and ${archivedMastered} mastered are saved under Profile → Past seasons.`
              : "Sprites don't carry between seasons, so the board starts fresh."}
          </p>
        </div>
        <button
          type="button"
          onClick={dismissSeasonRollover}
          data-testid="button-dismiss-rollover"
          aria-label="Dismiss"
          className="tap shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground active:scale-95"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export function GuestBanner({ onCreateAccount }: { onCreateAccount: () => void }) {
  const { mode, guestEntryCount, backendAvailable } = useStore();
  // With no API there is nothing to sync to, so the nag would be a dead end.
  if (mode !== "guest" || !backendAvailable) return null;
  return (
    <div
      className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3"
      data-testid="banner-guest"
    >
      <div className="min-w-0 flex-1 text-[12px] leading-snug">
        <p className="font-semibold text-foreground">Playing as guest on this device</p>
        <p className="text-muted-foreground num">
          {guestEntryCount} variant{guestEntryCount === 1 ? "" : "s"} saved locally. Create an
          account to sync across devices.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreateAccount}
        data-testid="button-guest-create-account"
        className="tap shrink-0 rounded-lg bg-accent px-3 text-[11px] font-bold uppercase tracking-wider text-accent-foreground active:scale-95"
      >
        Sync
      </button>
    </div>
  );
}
