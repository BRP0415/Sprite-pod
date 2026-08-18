import { useMemo, useState } from "react";
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Sprite art.
 * Official in-game Sprite icons (extracted from the Fortnite game files)
 * are served from /sprites/<spriteId>-<finishId>.webp. If an icon is
 * missing — e.g. a brand-new Sprite lands before art is mirrored — we
 * fall back to the procedural "pod" portrait below so the grid never
 * shows a broken image.
 * ------------------------------------------------------------------ */

/* Resolve against the document base so art works both on the dev server
 * (served from /) and on a deployed bundle served from a deep sub-path. */
export function artUrl(spriteId: string, finishId: string) {
  const rel = `sprites/${spriteId}-${finishId}.webp`;
  try {
    return new URL(rel, document.baseURI).href;
  } catch {
    return `/${rel}`;
  }
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/* Thematic hues drive the pod glow behind each Sprite, and the fallback art. */
const SPRITE_HUES: Record<string, number> = {
  water: 198,
  earth: 108,
  fire: 14,
  fishy: 176,
  air: 210,
  duck: 46,
  ghost: 268,
  demon: 348,
  king: 42,
  aura: 288,
  striker: 152,
  dream: 312,
  punk: 332,
  boss: 356,
  seven: 224,
  llama: 244,
  peely: 50,
  batman: 232,
  grim: 276,
  zeropoint: 186,
  burntpeanut: 26,
  vinijr: 60,
  pollo: 34,
  johnwick: 206,
  ironmouse: 320,
};

function hueFor(spriteId: string) {
  return SPRITE_HUES[spriteId] ?? hash(spriteId) % 360;
}

/* Finish-specific pod backdrop. The official artwork already carries the
 * finish material, so the backdrop only frames it with matching light. */
function backdrop(finishId: string, hue: number): string {
  switch (finishId) {
    case "gold":
      return "radial-gradient(120% 100% at 30% 0%, rgba(232,182,76,0.30), rgba(10,12,18,0.92) 70%)";
    case "gummy":
      return "radial-gradient(120% 100% at 25% 5%, rgba(255,95,162,0.30), rgba(10,12,18,0.92) 72%)";
    case "galaxy":
      return "radial-gradient(110% 90% at 70% 10%, rgba(139,107,255,0.34), rgba(8,8,20,0.95) 70%)";
    case "gem":
      return "radial-gradient(120% 100% at 30% 0%, rgba(56,214,196,0.28), rgba(8,14,18,0.93) 70%)";
    case "holofoil":
      return "conic-gradient(from 210deg at 40% 30%, rgba(94,200,255,0.34), rgba(200,139,255,0.30), rgba(139,255,214,0.30), rgba(255,212,240,0.28), rgba(94,200,255,0.34))";
    case "cube":
      return "linear-gradient(150deg, rgba(199,75,255,0.32), rgba(12,8,22,0.94) 68%)";
    case "quack":
      return "linear-gradient(120deg, rgba(255,216,61,0.32), rgba(18,14,6,0.93) 62%)";
    default:
      return `radial-gradient(120% 100% at 30% 0%, hsl(${hue} 60% 45% / 0.28), rgba(10,12,18,0.92) 70%)`;
  }
}

/* ---------------------------- fallback art ---------------------------- */

const BODIES = [
  "M50 14c19 0 30 14 30 32 0 19-13 30-30 30S20 65 20 46C20 28 31 14 50 14Z",
  "M50 12 78 28v36L50 80 22 64V28Z",
  "M50 13c22 0 31 9 31 31s-9 32-31 32-31-10-31-32S28 13 50 13Z",
  "M50 11c16 8 28 22 28 37 0 17-13 28-28 28s-28-11-28-28c0-15 12-29 28-37Z",
  "M50 11 76 32l-6 38-20 8-20-8-6-38Z",
];

function FallbackArt({ spriteId, size }: { spriteId: string; size: number }) {
  const h = hash(spriteId);
  const hue = hueFor(spriteId);
  const body = BODIES[h % BODIES.length];
  const uid = `fb-${spriteId}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id={uid} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor={`hsl(${hue} 62% 66%)`} />
          <stop offset="60%" stopColor={`hsl(${hue} 58% 48%)`} />
          <stop offset="100%" stopColor={`hsl(${hue} 55% 30%)`} />
        </linearGradient>
      </defs>
      <path d={body} fill={`url(#${uid})`} stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
      <ellipse cx="40" cy="46" rx="6" ry="7.5" fill="#0b0d14" />
      <ellipse cx="60" cy="46" rx="6" ry="7.5" fill="#0b0d14" />
      <circle cx="41.5" cy="44" r="2.4" fill="#fff" opacity="0.9" />
      <circle cx="61.5" cy="44" r="2.4" fill="#fff" opacity="0.9" />
      <path d="M43 60q7 6 14 0" stroke="#0b0d14" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* ------------------------------- tile -------------------------------- */

export function PodTile({
  spriteId,
  finishId,
  size = 56,
  status = "none",
  className,
  animateKey,
  alt,
  eager,
}: {
  spriteId: string;
  finishId: string;
  size?: number;
  status?: "none" | "collected" | "mastered";
  className?: string;
  animateKey?: number;
  alt?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const hue = useMemo(() => hueFor(spriteId), [spriteId]);
  const bg = useMemo(() => backdrop(finishId, hue), [finishId, hue]);
  const src = artUrl(spriteId, finishId);

  return (
    <div
      key={animateKey}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-2xl border",
        animateKey ? "pop" : "",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: status === "none" ? "rgba(255,255,255,0.035)" : bg,
        borderColor:
          status === "mastered"
            ? "rgba(255,216,61,0.7)"
            : status === "none"
              ? "rgba(255,255,255,0.10)"
              : "rgba(255,255,255,0.16)",
        boxShadow:
          status === "mastered"
            ? "0 0 0 1px rgba(255,216,61,0.28), 0 6px 20px -8px rgba(255,216,61,0.5)"
            : "inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      {failed ? (
        <FallbackArt spriteId={spriteId} size={size} />
      ) : (
        <img
          src={src}
          alt={alt ?? ""}
          width={size}
          height={size}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full select-none object-contain"
          style={{
            padding: Math.round(size * 0.05),
            opacity: status === "none" ? 0.62 : 1,
            filter:
              status === "none"
                ? "grayscale(0.55) brightness(0.85)"
                : "drop-shadow(0 2px 6px rgba(0,0,0,0.45))",
          }}
        />
      )}
      {status === "mastered" && (
        <Crown
          className="absolute right-0.5 top-0.5 text-[#ffd83d] drop-shadow"
          style={{ width: Math.max(10, size * 0.26), height: Math.max(10, size * 0.26) }}
          strokeWidth={2.5}
        />
      )}
    </div>
  );
}

export function SpriteMark({ spriteId, size = 44 }: { spriteId: string; size?: number }) {
  return <PodTile spriteId={spriteId} finishId="normal" size={size} status="collected" />;
}
