/**
 * Pin up to four collected variants to the top of your profile. Friends see
 * the same four on their Friends list and on your pod page, so it doubles as
 * a calling card.
 */
import { useEffect, useMemo, useState } from "react";
import { Pencil, Sparkles } from "lucide-react";
import { PodTile } from "@/components/PodTile";
import { useStore } from "@/lib/store";
import { finishById, getVariant, variantKey } from "@/lib/roster";
import {
  SHOWCASE_MAX,
  useSaveShowcase,
  useShowcase,
  useSocialReady,
  type ShowcasePick,
} from "@/lib/social";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function ShowcaseEditor() {
  const { roster, progress } = useStore();
  const { ready } = useSocialReady();
  const showcaseQuery = useShowcase();
  const save = useSaveShowcase();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ShowcasePick[]>([]);
  const [error, setError] = useState<string | null>(null);

  const saved = showcaseQuery.data?.items ?? [];

  // Re-seed the draft each time the sheet opens so cancelling really cancels.
  useEffect(() => {
    if (open) {
      setDraft(saved);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** You can only show off what you actually hold. */
  const owned = useMemo(() => {
    if (!roster) return [];
    return roster.sprites.flatMap((sprite) =>
      sprite.finishes
        .filter((f) => getVariant(progress, sprite.id, f).status !== "none")
        .map((f) => ({
          spriteId: sprite.id,
          finishId: f,
          spriteName: sprite.name,
          status: getVariant(progress, sprite.id, f).status,
        })),
    );
  }, [roster, progress]);

  if (!ready || !roster) return null;

  const isPicked = (spriteId: string, finishId: string) =>
    draft.some((d) => d.spriteId === spriteId && d.finishId === finishId);

  const toggle = (spriteId: string, finishId: string) => {
    setError(null);
    setDraft((current) => {
      const exists = current.some((d) => d.spriteId === spriteId && d.finishId === finishId);
      if (exists) {
        return current.filter((d) => !(d.spriteId === spriteId && d.finishId === finishId));
      }
      if (current.length >= SHOWCASE_MAX) {
        setError(`Pick up to ${SHOWCASE_MAX} — tap one to swap it out.`);
        return current;
      }
      return [...current, { spriteId, finishId }];
    });
  };

  return (
    <section className="mt-4 px-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider">
          <Sparkles className="h-4 w-4 text-primary" /> Showcase
        </h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="button-edit-showcase"
          className="tap flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary active:scale-95"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
        Up to {SHOWCASE_MAX} favourites, pinned to your profile for friends to see.
      </p>

      <div className="mt-2 rounded-2xl border border-card-border bg-card p-3">
        {saved.length === 0 ? (
          <p className="text-[12px] text-muted-foreground" data-testid="text-showcase-empty">
            Nothing pinned yet. Tap Edit to choose your best pulls.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2" data-testid="list-showcase">
            {saved.map((item) => {
              const finish = finishById(roster, item.finishId);
              const sprite = roster.sprites.find((s) => s.id === item.spriteId);
              return (
                <li
                  key={variantKey(item.spriteId, item.finishId)}
                  className="flex w-[calc(50%-0.25rem)] items-center gap-2 rounded-xl border border-border bg-background/60 p-2"
                  data-testid={`row-showcase-${item.spriteId}-${item.finishId}`}
                >
                  <PodTile
                    spriteId={item.spriteId}
                    finishId={item.finishId}
                    size={34}
                    status="mastered"
                  />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[11.5px] font-semibold">
                      {(sprite?.name ?? item.spriteId).replace(" Sprite", "")}
                    </span>
                    <span
                      className="block truncate text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: finish?.hex }}
                    >
                      {finish?.name ?? item.finishId}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] gap-3 overflow-hidden" data-testid="dialog-showcase">
          <DialogHeader>
            <DialogTitle className="text-base">Choose your showcase</DialogTitle>
            <DialogDescription>
              {owned.length === 0
                ? "Collect a variant first — you can only show off what you own."
                : `Tap up to ${SHOWCASE_MAX} variants. ${draft.length}/${SHOWCASE_MAX} picked.`}
            </DialogDescription>
          </DialogHeader>

          <div className="scrollbar-none -mx-1 max-h-[52dvh] overflow-y-auto px-1">
            {owned.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-muted-foreground">
                Nothing collected yet this season.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-1.5">
                {owned.map((v) => {
                  const picked = isPicked(v.spriteId, v.finishId);
                  const finish = finishById(roster, v.finishId);
                  return (
                    <li key={variantKey(v.spriteId, v.finishId)}>
                      <button
                        type="button"
                        onClick={() => toggle(v.spriteId, v.finishId)}
                        data-testid={`button-pick-${v.spriteId}-${v.finishId}`}
                        aria-pressed={picked}
                        className={cn(
                          "tap flex w-full items-center gap-2 rounded-xl border p-2 text-left transition-colors active:scale-[0.97]",
                          picked
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background/60",
                        )}
                      >
                        <PodTile
                          spriteId={v.spriteId}
                          finishId={v.finishId}
                          size={30}
                          status={v.status}
                        />
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block truncate text-[11px] font-semibold">
                            {v.spriteName.replace(" Sprite", "")}
                          </span>
                          <span
                            className="block truncate text-[9.5px] font-bold uppercase tracking-wider"
                            style={{ color: finish?.hex }}
                          >
                            {finish?.name}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error && (
            <p className="text-[11.5px] text-destructive" data-testid="text-showcase-error">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              data-testid="button-cancel-showcase"
              className="tap flex-1 rounded-xl border border-border bg-card text-[12px] font-bold uppercase tracking-wider text-muted-foreground active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => {
                save
                  .mutateAsync(draft)
                  .then(() => setOpen(false))
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : "Could not save that."),
                  );
              }}
              data-testid="button-save-showcase"
              className="tap flex-1 rounded-xl bg-primary text-[12px] font-bold uppercase tracking-wider text-primary-foreground active:scale-[0.98] disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save showcase"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
