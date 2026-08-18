import { useState } from "react";
import { useLocation } from "wouter";
import {
  Check,
  ChevronRight,
  Clock3,
  Inbox,
  Send,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { AppHeader, RosterFooter } from "@/components/Chrome";
import { BackendRequiredCard, ShowcaseStrip, SignInRequiredCard } from "@/components/Social";
import { useStore } from "@/lib/store";
import { totals } from "@/lib/roster";
import {
  useAcceptRequest,
  useFriends,
  useRemoveFriend,
  useSendRequest,
  useSocialReady,
  useUserSearch,
} from "@/lib/social";
import { Skeleton } from "@/components/ui/skeleton";

export default function FriendsPage() {
  const { roster, progress, username } = useStore();
  const { backendAvailable, signedIn } = useSocialReady();
  const [, navigate] = useLocation();

  const [query, setQuery] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const friendsQuery = useFriends();
  const search = useUserSearch(query);
  const sendRequest = useSendRequest();
  const acceptRequest = useAcceptRequest();
  const removeFriend = useRemoveFriend();

  const t = roster ? totals(roster, progress) : null;
  const data = friendsQuery.data;

  const send = async (name: string) => {
    setNote(null);
    setError(null);
    try {
      const res = (await sendRequest.mutateAsync(name)) as { username: string; status: string };
      setQuery("");
      setNote(
        res.status === "accepted"
          ? `You and @${res.username} are now friends.`
          : `Request sent to @${res.username}. They will see it next time they open their pod.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that request.");
    }
  };

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setNote(null);
    setError(null);
    try {
      await fn();
      setNote(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    }
  };

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

  return (
    <div className="pb-28">
      <AppHeader subtitle="Friends" />

      <section className="px-4 pt-3">
        <div className="rounded-2xl border border-card-border bg-card p-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h2 className="text-[13px] font-bold uppercase tracking-wider">Add a friend</h2>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
            Send a request by username. They have to accept before either of you can see the other's
            board. Yours is <span className="font-semibold text-foreground">@{username}</span>.
          </p>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = query.trim();
              if (name) void send(name);
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Their username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              data-testid="input-friend-username"
              className="tap min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-[13px] outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={query.trim().length < 3 || sendRequest.isPending}
              data-testid="button-send-request"
              className="tap flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 text-[11.5px] font-bold uppercase tracking-wider text-primary-foreground active:scale-[0.98] disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Send
            </button>
          </form>

          {search.data && search.data.results.length > 0 && (
            <ul className="mt-2 space-y-1.5" data-testid="list-friend-search">
              {search.data.results.map((r) => (
                <li
                  key={r.username}
                  className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-2.5 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                    @{r.username}
                  </span>
                  {r.relation === "none" ? (
                    <button
                      type="button"
                      onClick={() => void send(r.username)}
                      disabled={sendRequest.isPending}
                      data-testid={`button-search-add-${r.username}`}
                      className="tap shrink-0 rounded-lg bg-primary px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-primary-foreground active:scale-95 disabled:opacity-50"
                    >
                      Add
                    </button>
                  ) : (
                    <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                      {r.relation === "friends"
                        ? "Friends"
                        : r.relation === "outgoing"
                          ? "Requested"
                          : "Wants to add you"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {note && (
            <p className="mt-2 text-[11.5px] leading-snug text-primary" data-testid="text-friend-note">
              {note}
            </p>
          )}
          {error && (
            <p
              className="mt-2 text-[11.5px] leading-snug text-destructive"
              data-testid="text-friend-error"
            >
              {error}
            </p>
          )}
        </div>
      </section>

      {friendsQuery.isLoading && (
        <div className="space-y-2.5 px-4 pt-4">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      )}

      {friendsQuery.isError && (
        <p
          className="mx-4 mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-[12px] text-foreground"
          data-testid="text-friends-load-error"
        >
          Could not reach the pod server. Pull down to retry once you are back online.
        </p>
      )}

      {data && data.incoming.length > 0 && (
        <section className="mt-4 px-4">
          <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider">
            <Inbox className="h-4 w-4 text-accent" /> Requests
            <span className="num rounded-md bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
              {data.incoming.length}
            </span>
          </h2>
          <ul className="mt-2 space-y-2">
            {data.incoming.map((r) => (
              <li
                key={r.username}
                data-testid={`row-incoming-${r.username}`}
                className="flex items-center gap-2 rounded-2xl border border-card-border bg-card p-3"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                  @{r.username}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void act(
                      () => acceptRequest.mutateAsync(r.username),
                      `@${r.username} is now a friend.`,
                    )
                  }
                  data-testid={`button-accept-${r.username}`}
                  aria-label={`Accept ${r.username}`}
                  className="tap flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-primary-foreground active:scale-95"
                >
                  <Check className="h-3.5 w-3.5" /> Accept
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void act(
                      () => removeFriend.mutateAsync(r.username),
                      `Declined @${r.username}.`,
                    )
                  }
                  data-testid={`button-decline-${r.username}`}
                  aria-label={`Decline ${r.username}`}
                  className="tap flex shrink-0 items-center justify-center rounded-xl border border-border bg-background px-2.5 py-2 text-muted-foreground active:scale-95"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.outgoing.length > 0 && (
        <section className="mt-4 px-4">
          <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider">
            <Clock3 className="h-4 w-4 text-muted-foreground" /> Waiting on them
          </h2>
          <ul className="mt-2 space-y-2">
            {data.outgoing.map((r) => (
              <li
                key={r.username}
                data-testid={`row-outgoing-${r.username}`}
                className="flex items-center gap-2 rounded-2xl border border-card-border bg-card p-3"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-muted-foreground">
                  @{r.username}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void act(
                      () => removeFriend.mutateAsync(r.username),
                      `Cancelled the request to @${r.username}.`,
                    )
                  }
                  data-testid={`button-cancel-request-${r.username}`}
                  className="tap shrink-0 rounded-xl border border-border bg-background px-3 py-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground active:scale-95"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4 px-4">
        <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider">
          <Users className="h-4 w-4 text-primary" /> Your friends
          {data && data.friends.length > 0 && (
            <span className="num text-[11px] font-semibold text-muted-foreground">
              {data.friends.length}
            </span>
          )}
        </h2>

        {data && data.friends.length === 0 ? (
          <p
            className="mt-2 rounded-2xl border border-card-border bg-card p-5 text-center text-[12.5px] leading-relaxed text-muted-foreground"
            data-testid="text-friends-empty"
          >
            No friends yet. Send a request above and their whole board — every variant, level and
            mastery — shows up here.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data?.friends.map((f) => (
              <li key={f.username}>
                <button
                  type="button"
                  onClick={() => navigate(`/friends/${f.username}`)}
                  data-testid={`button-friend-${f.username}`}
                  className="tap flex w-full items-center gap-3 rounded-2xl border border-card-border bg-card p-3 text-left active:scale-[0.99]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-[13px] font-bold uppercase text-primary">
                    {f.username.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold">@{f.username}</span>
                    <span
                      className="num block text-[11px] text-muted-foreground"
                      data-testid={`text-friend-stats-${f.username}`}
                    >
                      {f.collected}
                      {t ? `/${t.total}` : ""} collected · {f.mastered} mastered
                      {t && f.mastered > t.mastered ? " · ahead of you" : ""}
                    </span>
                    {f.showcase.length > 0 && (
                      <span className="mt-1.5 block">
                        <ShowcaseStrip
                          items={f.showcase}
                          size={28}
                          testId={`strip-showcase-${f.username}`}
                        />
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data && data.friends.length > 0 && (
        <p
          className="mt-3 px-4 text-[11px] leading-relaxed text-muted-foreground"
          data-testid="text-friends-hint"
        >
          Tap a friend to see their full board, or switch to Compare to see exactly which variants
          they have that you are missing.
        </p>
      )}

      <RosterFooter />
    </div>
  );
}
