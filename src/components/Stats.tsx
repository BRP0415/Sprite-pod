import { Check, Crown, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Roster } from "@/lib/roster";

export function StatRing({
  value,
  total,
  label,
  color,
  icon,
  testId,
}: {
  value: number;
  total: number;
  label: string;
  color: string;
  icon: "check" | "crown" | "target";
  testId: string;
}) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const r = 30;
  const c = 2 * Math.PI * r;
  const Icon = icon === "check" ? Check : icon === "crown" ? Crown : Target;
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-card-border bg-card px-1.5 py-3">
      <div className="relative h-[74px] w-[74px]">
        <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
          <circle cx="36" cy="36" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
          <circle
            cx="36"
            cy="36"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            style={{ transition: "stroke-dashoffset 420ms cubic-bezier(0.22,1,0.36,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className="mb-0.5 h-3 w-3" style={{ color }} strokeWidth={2.6} />
          <span className="num text-[15px] font-bold leading-none" data-testid={testId}>
            {value}
          </span>
          <span className="num text-[10px] leading-none text-muted-foreground">/{total}</span>
        </div>
      </div>
      <span className="text-center text-[10px] font-semibold uppercase leading-tight tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function MilestoneList({
  roster,
  mastered,
  compact = false,
}: {
  roster: Roster;
  mastered: number;
  compact?: boolean;
}) {
  const sorted = [...roster.masteryMilestones].sort((a, b) => a.count - b.count);
  return (
    <ul className="space-y-2" data-testid="list-milestones">
      {sorted.map((m) => {
        const done = mastered >= m.count;
        const pct = Math.min(100, Math.round((mastered / m.count) * 100));
        const remaining = Math.max(0, m.count - mastered);
        return (
          <li
            key={m.count}
            className={cn(
              "rounded-xl border p-3",
              done ? "border-primary/45 bg-primary/10" : "border-card-border bg-card",
            )}
            data-testid={`row-milestone-${m.count}`}
          >
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  "num mt-0.5 flex h-6 min-w-[30px] items-center justify-center rounded-md px-1 text-[11px] font-bold",
                  done
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                {m.count}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug">{m.reward}</p>
                {!compact && (
                  <p className="num mt-0.5 text-[11px] text-muted-foreground">
                    {done ? "Unlocked" : `${remaining} more mastered variant${remaining === 1 ? "" : "s"}`}
                  </p>
                )}
              </div>
              {done && <Crown className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", done ? "bg-primary" : "bg-accent")}
                style={{ width: `${pct}%`, transition: "width 420ms cubic-bezier(0.22,1,0.36,1)" }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function BarStat({
  label,
  value,
  total,
  color,
  testId,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  testId: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="num text-[12px] font-bold" data-testid={testId}>
          {value}
          <span className="text-muted-foreground">/{total}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: color,
            transition: "width 420ms cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </div>
    </div>
  );
}
