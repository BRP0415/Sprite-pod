/**
 * Roster auto-refresh.
 *
 * Reads the live Sprite icon set out of the game files (via fortnite.gg's
 * rendered icon list), works out which Sprites and which finishes exist right
 * now, downloads any artwork we don't have yet, and merges the result into
 * shared/spriteData.json — keeping the hand-curated bits (rarity, drop rate,
 * ability text) for Sprites we already know about.
 *
 * It is designed to run unattended in CI, so it refuses to write a roster it
 * doesn't trust and explains why instead.
 *
 *   npm run refresh:roster              # update files in place
 *   npm run refresh:roster -- --dry-run # report only, touch nothing
 *
 * Season rollover: when a large share of the current Sprites vanish from the
 * live set, that's a new season. The script rolls the season forward and lets
 * the app archive the finished season's progress. Override any guess with
 * --chapter / --season / --season-name / --ends.
 *
 * Why the finish list isn't hardcoded: new finishes ship mid-season. Finishes
 * are derived by comparing variant names against their base Sprite name, so a
 * brand-new finish is discovered automatically and flagged for review.
 */
import { readFile, writeFile, mkdir, access, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

const run = promisify(execFile);

const ROOT = path.resolve(import.meta.dirname, "..");
const ROSTER_PATH = path.join(ROOT, "shared", "spriteData.json");
const ART_DIR = path.join(ROOT, "client", "public", "sprites");
const MANIFEST_PATH = path.join(ART_DIR, "manifest.json");
/**
 * A copy served as a plain static file. The app fetches this at runtime, so an
 * installed PWA picks up new Sprites without being reinstalled or rebuilt.
 */
const PUBLIC_ROSTER_PATH = path.join(ROOT, "client", "public", "roster.json");

/** Overridable so the refresh can be tested against a fixture page. */
const SPRITE_INDEX = process.env.SPRITE_INDEX_URL || "https://fortnite.gg/sprites";
const BUILD_API = "https://fortnite-api.com/v2/aes";

/** fortnite.gg only renders the 512px icon list to a mobile Safari client. */
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

/**
 * Below this many icons the page clearly didn't render its list — no real
 * season ships fewer. Deliberately low: a brand-new season starts small, and
 * blocking that would break the refresh exactly when it matters most.
 */
const MIN_TRUSTED_ICONS = 12;
/** Share of known Sprites that must disappear before we call it a new season. */
const ROLLOVER_THRESHOLD = 0.4;
/**
 * A big drop is only believable as a season reset if plenty of *new* Sprites
 * showed up too. Losing Sprites while gaining almost none looks far more like
 * a half-rendered page, so that case is refused unless forced.
 */
const MIN_NEW_FOR_ROLLOVER = 5;

// ---------------------------------------------------------------- types

type Finish = { id: string; name: string; bonus: string; hex: string };
type Rarity = { id: string; hex: string };
type Sprite = {
  id: string;
  name: string;
  rarity: string;
  dropRate: string;
  ability: string;
  finishes: string[];
  needsReview?: boolean;
};
type Season = {
  id: string;
  chapter: number;
  season: number;
  name: string;
  endsOn: string | null;
  note: string;
  dataVersion: string;
  patch?: string;
  sources: string[];
};
type Roster = {
  season: Season;
  finishes: Finish[];
  rarities: Rarity[];
  sprites: Sprite[];
  masteryMilestones: { count: number; reward: string }[];
  variantCount: number;
  artManifestVersion: string;
  sources: string[];
};

type DiscoveredVariant = { finishLabel: string; iconUrl: string; alt: string };
type DiscoveredSprite = { name: string; variants: Map<string, DiscoveredVariant> };

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
};

const DRY_RUN = flag("dry-run");

// ---------------------------------------------------------------- helpers

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const titleWords = (s: string) => s.trim().replace(/\s+/g, " ");

/**
 * fortnite.gg rejects Node's built-in fetch (its TLS handshake is recognisable
 * and gets a 403) but answers curl normally, so curl is the primary transport
 * and fetch is only a fallback for hosts that don't care.
 */
async function fetchText(url: string) {
  try {
    const { stdout } = await run(
      "curl",
      [
        "-sSL",
        "--compressed",
        "--max-time",
        "60",
        "--retry",
        "3",
        "--retry-delay",
        "2",
        "--fail",
        "-A",
        UA,
        "-H",
        "Accept-Language: en-US,en;q=0.9",
        url,
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    return stdout;
  } catch (curlErr) {
    const why = curlErr instanceof Error ? curlErr.message.split("\n")[0] : String(curlErr);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/json,*/*",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return await res.text();
    } catch (fetchErr) {
      const why2 = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      throw new Error(`GET ${url} failed — curl: ${why} · fetch: ${why2}`);
    }
  }
}

/** Same transport story as fetchText, for binary icon downloads. */
async function downloadBinary(url: string, dest: string) {
  const tmp = path.join(tmpdir(), `sprite-dl-${process.pid}-${Math.random().toString(36).slice(2)}`);
  try {
    await run(
      "curl",
      [
        "-sSL",
        "--max-time",
        "60",
        "--retry",
        "3",
        "--retry-delay",
        "2",
        "--fail",
        "-A",
        UA,
        "-H",
        `Referer: ${SPRITE_INDEX}`,
        "-o",
        tmp,
        url,
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const buf = await readFile(tmp);
    if (buf.length < 200) throw new Error(`suspiciously small (${buf.length} bytes)`);
    await writeFile(dest, buf);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Neutral slate for anything we discovered but can't colour meaningfully yet. */
const PLACEHOLDER_HEX = "#9aa4b2";

// ---------------------------------------------------------------- discovery

/**
 * Pull every Sprite icon off the index page.
 * Each entry is an icon URL plus its alt text, e.g. "Gold Batman Sprite".
 */
async function fetchIconIndex() {
  const html = await fetchText(SPRITE_INDEX);
  const found: { url: string; alt: string }[] = [];
  const patterns = [
    /<img[^>]+src='([^']*sprites\/icons\/[^']+)'[^>]*alt='([^']*)'/g,
    /<img[^>]+src="([^"]*sprites\/icons\/[^"]+)"[^>]*alt="([^"]*)"/g,
  ];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      found.push({ url: new URL(m[1], SPRITE_INDEX).href, alt: titleWords(m[2]) });
    }
    if (found.length) break;
  }
  // De-duplicate on alt text; the page can repeat an icon in multiple sections.
  const seen = new Set<string>();
  return found.filter((f) => {
    const key = f.alt.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Split the flat icon list into Sprites and their finishes.
 *
 * Every variant is named "<Finish> <Sprite> Sprite" and the plain Sprite is
 * just "<Sprite> Sprite". So a name that ends with another, shorter name is a
 * finish of it — which means we never need to know the finish list up front.
 */
function groupSprites(icons: { url: string; alt: string }[]) {
  const bare = icons.map((i) => ({
    ...i,
    label: titleWords(i.alt.replace(/\s*Sprite\s*$/i, "")),
  }));

  const labels = bare.map((b) => b.label);
  const isBase = (label: string) =>
    !labels.some((other) => other !== label && label.toLowerCase().endsWith(` ${other.toLowerCase()}`));

  const sprites = new Map<string, DiscoveredSprite>();
  const newFinishLabels = new Set<string>();

  // Longest base names first so "Zero Point" wins over a hypothetical "Point".
  const bases = labels.filter(isBase).sort((a, b) => b.length - a.length);

  for (const entry of bare) {
    let baseName = bases.find(
      (b) => entry.label.toLowerCase() === b.toLowerCase(),
    );
    let finishLabel = "Normal";

    if (!baseName) {
      baseName = bases.find((b) => entry.label.toLowerCase().endsWith(` ${b.toLowerCase()}`));
      if (baseName) {
        finishLabel = titleWords(entry.label.slice(0, entry.label.length - baseName.length));
      }
    }

    if (!baseName) {
      // Shouldn't happen — every label is either a base or ends with one.
      baseName = entry.label;
      finishLabel = "Normal";
    }

    const id = slug(baseName);
    if (!sprites.has(id)) sprites.set(id, { name: `${baseName} Sprite`, variants: new Map() });
    const finishId = slug(finishLabel);
    sprites.get(id)!.variants.set(finishId, {
      finishLabel,
      iconUrl: entry.url,
      alt: entry.alt,
    });
    if (finishLabel !== "Normal") newFinishLabels.add(finishLabel);
  }

  return { sprites, finishLabels: newFinishLabels };
}

/** Current game build, e.g. "41.30" from "++Fortnite+Release-41.30-CL-56430492". */
async function fetchPatch(): Promise<string | undefined> {
  try {
    const j = JSON.parse(await fetchText(BUILD_API)) as { data?: { build?: string } };
    const m = /Release-([\d.]+)/.exec(j.data?.build ?? "");
    return m?.[1];
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const roster = JSON.parse(await readFile(ROSTER_PATH, "utf8")) as Roster;

  const icons = await fetchIconIndex();
  console.log(`fetched ${icons.length} icons from ${SPRITE_INDEX}`);
  if (icons.length < MIN_TRUSTED_ICONS) {
    throw new Error(
      `only ${icons.length} icons parsed (expected at least ${MIN_TRUSTED_ICONS}). ` +
        `The source page probably didn't render its list — refusing to rewrite the roster.`,
    );
  }

  const { sprites: discovered, finishLabels } = groupSprites(icons);
  const patch = await fetchPatch();

  const knownIds = new Set(roster.sprites.map((s) => s.id));
  const liveIds = new Set(discovered.keys());
  const goneIds = [...knownIds].filter((id) => !liveIds.has(id));
  const addedIds = [...liveIds].filter((id) => !knownIds.has(id));
  const rolloverShare = knownIds.size ? goneIds.length / knownIds.size : 0;
  const bigDrop = rolloverShare >= ROLLOVER_THRESHOLD;
  const rollover = bigDrop && addedIds.length >= MIN_NEW_FOR_ROLLOVER;

  if (bigDrop && !rollover && !flag("force")) {
    throw new Error(
      `${goneIds.length} of ${knownIds.size} sprites vanished but only ` +
        `${addedIds.length} new ones appeared. That looks like an incomplete page ` +
        `rather than a season reset, so the roster was left alone. ` +
        `Re-run with --force if the drop is real.`,
    );
  }

  // --- finishes: keep curated entries, append anything new ---
  const finishes: Finish[] = roster.finishes.map((f) => ({ ...f }));
  const finishIds = new Set(finishes.map((f) => f.id));
  const brandNewFinishes: string[] = [];
  for (const label of finishLabels) {
    const id = slug(label);
    if (finishIds.has(id)) continue;
    finishes.push({
      id,
      name: label,
      bonus: "Bonus not documented yet.",
      hex: PLACEHOLDER_HEX,
    });
    finishIds.add(id);
    brandNewFinishes.push(label);
  }

  // --- sprites: merge live structure onto curated metadata ---
  const byId = new Map(roster.sprites.map((s) => [s.id, s]));
  const sprites: Sprite[] = [];
  const changedFinishes: string[] = [];

  for (const [id, found] of discovered) {
    const prev = byId.get(id);
    const liveFinishes = [...found.variants.keys()].sort((a, b) => {
      // Keep the curated finish order so the UI stays stable.
      const ai = finishes.findIndex((f) => f.id === a);
      const bi = finishes.findIndex((f) => f.id === b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    if (prev) {
      const before = [...prev.finishes].sort().join(",");
      const after = [...liveFinishes].sort().join(",");
      if (before !== after) {
        const gained = liveFinishes.filter((f) => !prev.finishes.includes(f));
        const lost = prev.finishes.filter((f) => !liveFinishes.includes(f));
        changedFinishes.push(
          `${id}: ${gained.length ? `+${gained.join("/")}` : ""}${
            gained.length && lost.length ? " " : ""
          }${lost.length ? `-${lost.join("/")}` : ""}`,
        );
      }
      sprites.push({ ...prev, name: prev.name || found.name, finishes: liveFinishes });
    } else {
      sprites.push({
        id,
        name: found.name,
        rarity: "Unknown",
        dropRate: "—",
        ability: "Ability not documented yet.",
        finishes: liveFinishes,
        needsReview: true,
      });
    }
  }

  // Keep a stable, readable order: curated order first, then newcomers.
  const originalOrder = roster.sprites.map((s) => s.id);
  sprites.sort((a, b) => {
    const ai = originalOrder.indexOf(a.id);
    const bi = originalOrder.indexOf(b.id);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  // "Unknown" needs to exist as a rarity so filters and colours keep working.
  const rarities: Rarity[] = roster.rarities.map((r) => ({ ...r }));
  if (
    sprites.some((s) => s.rarity === "Unknown") &&
    !rarities.some((r) => r.id === "Unknown")
  ) {
    rarities.push({ id: "Unknown", hex: PLACEHOLDER_HEX });
  }

  // --- artwork ---
  await mkdir(ART_DIR, { recursive: true });
  const manifest: Record<string, string> = {};
  const downloaded: string[] = [];
  const failed: string[] = [];

  for (const [spriteId, found] of discovered) {
    for (const [finishId, variant] of found.variants) {
      const file = `${spriteId}-${finishId}.webp`;
      manifest[`${spriteId}|${finishId}`] = `/sprites/${file}`;
      const dest = path.join(ART_DIR, file);
      if (await exists(dest)) continue;
      if (DRY_RUN) {
        downloaded.push(file);
        continue;
      }
      try {
        await downloadBinary(variant.iconUrl, dest);
        downloaded.push(file);
      } catch (err) {
        failed.push(`${file} (${err instanceof Error ? err.message : String(err)})`);
      }
    }
  }

  // --- season ---
  const season: Season = { ...roster.season, patch: patch ?? roster.season.patch };
  if (rollover) {
    const chapter = Number(value("chapter") ?? season.chapter);
    const num = Number(value("season") ?? season.season + 1);
    season.chapter = chapter;
    season.season = num;
    season.id = `c${chapter}s${num}`;
    season.name = value("season-name") ?? `Season ${num}`;
    season.endsOn = value("ends") ?? null;
    // This note sits in a deadline-warning card, so keep it forward-looking:
    // the reset that already happened is announced separately in the app.
    season.note =
      `Sprites collected in Chapter ${chapter} Season ${num} do not carry over — ` +
      `every collection resets when the next season starts.`;
  } else {
    if (value("chapter")) season.chapter = Number(value("chapter"));
    if (value("season")) season.season = Number(value("season"));
    if (value("season-name")) season.name = value("season-name")!;
    if (value("ends")) season.endsOn = value("ends")!;
    if (value("chapter") || value("season")) season.id = `c${season.chapter}s${season.season}`;
  }

  // The live icon list is the source this file is actually built from, so make
  // sure it is credited in the in-app source list.
  const sources = roster.season.sources.includes(SPRITE_INDEX)
    ? roster.season.sources
    : [...roster.season.sources, "https://fortnite.gg/sprites"];
  season.sources = sources;

  const variantCount = sprites.reduce((n, s) => n + s.finishes.length, 0);
  const today = new Date().toISOString().slice(0, 10);

  const next: Roster = {
    ...roster,
    season: { ...season, dataVersion: today },
    finishes,
    rarities,
    sprites,
    variantCount,
    artManifestVersion: today,
  };

  // --- report ---
  const before = JSON.stringify(roster);
  const after = JSON.stringify(next);
  const changed = before !== after || downloaded.length > 0;

  const lines: string[] = [];
  lines.push(`Sprites live: ${discovered.size} · variants: ${variantCount}`);
  lines.push(`Previously: ${roster.sprites.length} sprites · ${roster.variantCount} variants`);
  if (patch) lines.push(`Game build: v${patch}`);
  if (addedIds.length) lines.push(`New sprites: ${addedIds.join(", ")}`);
  if (goneIds.length) lines.push(`No longer listed: ${goneIds.join(", ")}`);
  if (brandNewFinishes.length) lines.push(`New finishes: ${brandNewFinishes.join(", ")}`);
  if (changedFinishes.length) lines.push(`Variant changes: ${changedFinishes.join(" · ")}`);
  if (downloaded.length)
    lines.push(`Artwork ${DRY_RUN ? "missing" : "downloaded"}: ${downloaded.length}`);
  if (failed.length) lines.push(`Artwork failed: ${failed.join(", ")}`);
  if (rollover)
    lines.push(
      `SEASON ROLLOVER: ${roster.season.id} -> ${next.season.id} ` +
        `(${Math.round(rolloverShare * 100)}% of sprites replaced)`,
    );
  const needsReview = sprites.filter((s) => s.needsReview).map((s) => s.id);
  if (needsReview.length)
    lines.push(`Needs metadata (rarity/drop rate/ability): ${needsReview.join(", ")}`);
  if (!changed) lines.push("No changes.");

  const report = lines.join("\n");
  console.log("\n" + report + "\n");

  if (!DRY_RUN && changed) {
    const serialized = JSON.stringify(next, null, 2) + "\n";
    await writeFile(ROSTER_PATH, serialized);
    await writeFile(PUBLIC_ROSTER_PATH, serialized);
    // Sorted keys keep CI diffs limited to real changes.
    const sortedManifest = Object.fromEntries(
      Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)),
    );
    await writeFile(MANIFEST_PATH, JSON.stringify(sortedManifest, null, 1) + "\n");
    console.log(`wrote ${path.relative(ROOT, ROSTER_PATH)}`);
  } else if (DRY_RUN) {
    console.log("dry run — nothing written");
  }

  // CI plumbing: outputs for the workflow, plus a human-readable job summary.
  const summaryTitle = rollover
    ? `Season rollover -> ${next.season.id}`
    : addedIds.length || brandNewFinishes.length || changedFinishes.length
      ? "New Sprite content"
      : "Roster refresh";
  if (process.env.GITHUB_OUTPUT) {
    const delim = `EOF_${createHash("sha256").update(report).digest("hex").slice(0, 8)}`;
    await writeFile(
      process.env.GITHUB_OUTPUT,
      [
        `changed=${changed}`,
        `rollover=${rollover}`,
        `season=${next.season.id}`,
        `sprites=${discovered.size}`,
        `variants=${variantCount}`,
        `title=${summaryTitle}`,
        // Multi-line values need the heredoc form in $GITHUB_OUTPUT.
        `report<<${delim}`,
        report,
        delim,
        "",
      ].join("\n"),
      { flag: "a" },
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## ${summaryTitle}\n\n\`\`\`\n${report}\n\`\`\`\n`,
      { flag: "a" },
    );
  }

  // A fingerprint makes it easy to eyeball whether data really moved.
  console.log(
    "roster fingerprint:",
    createHash("sha256").update(after).digest("hex").slice(0, 12),
  );
}

main().catch((err) => {
  console.error("\nrefresh failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
