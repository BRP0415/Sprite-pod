# Sprite Pod

A Fortnite Sprite collection & mastery tracker. Track all **25 Sprites / 117 variants**
of Chapter 7 Season 3, mark each variant as Not collected → Collected → Mastered,
set a live level (1–5), and see what's worth farming next. Installs to your phone
home screen as a full-screen app and works offline.

The roster **updates itself**: a scheduled job checks Fortnite every few hours,
pulls in new Sprites, variants and artwork, and handles a season rollover by
archiving your old board instead of losing it. Already-installed apps pick the
changes up on their next launch — see [Auto-updating the roster](#auto-updating-the-roster).

Built with React + Vite + Tailwind on the front end, and Express + SQLite on the
back end for username + PIN accounts.

---

## Read this first: two ways to run it

The app has an accounts backend (username + PIN, synced across devices). **GitHub
Pages cannot run that backend** — Pages only serves static files, it can't run a
Node server. So pick one:

| | Where it runs | Progress saved | Sign in? | Friends? |
|---|---|---|---|---|
| **A. Static** | GitHub Pages (free) | In each browser, per device | No — nothing to sign in to | No |
| **B. Fullstack** | Any Node host | Server-side, per account | Yes — username + PIN | Yes |
| **C. Split** | Pages front end + Node backend | Server-side, per account | Yes — username + PIN | Yes |

**If you want friends, profiles, compare or showcase, you need option B or C.**
Those features store data for two different people and check who is allowed to
see what, which a static file host cannot do. On option A the Friends tab stays
visible but shows a short card explaining how to switch it on — nothing breaks.

The same codebase does all three. The app detects at runtime whether an API is
reachable: if it is, you get accounts; if not, it quietly falls back to the
roster bundled into the build and saves progress in that browser. Either way,
**Profile → Backup → Export** writes a JSON file you can restore anywhere, so
device-local progress is never trapped.

---

## Option A — GitHub Pages (easiest, no accounts)

1. Create an empty repo on GitHub, e.g. `sprite-pod`.
2. Extract this zip, then from inside the folder:

   ```bash
   git init
   git add .
   git commit -m "Sprite Pod"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/sprite-pod.git
   git push -u origin main
   ```

3. In the repo: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. The included workflow (`.github/workflows/deploy-pages.yml`) builds and
   publishes on every push to `main`. First run takes a couple of minutes.
5. Your site: `https://YOUR-USERNAME.github.io/sprite-pod/`

Sub-paths are handled — Vite builds with a relative base and sprite art resolves
against the document base, so it works at `/sprite-pod/` without configuration.

**What you get:** the full tracker, real sprite art, offline install, per-browser
saving. **What you don't:** cross-device sync, and no friends/profiles/compare —
those need a server (see option C). Use Export/Restore to move a pod between
devices.

### Custom domain

Add a `CNAME` file in `client/public/` containing your domain, point DNS at
GitHub, and set the domain under Settings → Pages.

---

## Option B — Fullstack with real accounts

Any host that runs Node 20+ works: Render, Railway, Fly.io, a VPS, or your own
machine. The server serves both the API and the built front end.

```bash
npm install
npm run build      # builds client -> dist/public and server -> dist/index.cjs
npm start          # serves on PORT (default 5000)
```

Host settings:

- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Node version:** 20 or newer

### Persistence warning

Progress lives in a SQLite file (`data.db`) next to the app. Hosts with
ephemeral disks (including Render's free tier and most container platforms) wipe
that file on redeploy or restart — accounts and progress would vanish. To keep
data:

- Attach a **persistent disk/volume** and point `DATABASE_PATH` at it, or
- Run on a VPS where the filesystem persists, or
- Swap SQLite for Postgres (the app uses Drizzle ORM, so `server/storage.ts` and
  `shared/schema.ts` are the two files to change).

### Local development

```bash
npm install
npm run dev        # http://localhost:5000, API + client with hot reload
```

---

## Option C — Pages front end + hosted backend

Best of both: free static hosting, real accounts.

1. Deploy the backend using Option B. Note its URL, e.g. `https://sprite-pod-api.onrender.com`.
2. In your GitHub repo: **Settings → Secrets and variables → Actions → Variables → New variable**
   - Name: `VITE_API_BASE`
   - Value: your backend URL, no trailing slash
3. On the backend, set `ALLOWED_ORIGINS` to your Pages origin so the browser is
   permitted to call it:

   ```
   ALLOWED_ORIGINS=https://YOUR-USERNAME.github.io
   ```

4. Re-run the Pages workflow. The build now points at your backend and the
   username + PIN screen comes back.

---

## Friends, profiles and compare

Requires a running backend (option B or C). On a static build the Friends tab
shows a card explaining this instead.

### How it works for players

- **Add someone** — Friends tab → type their username. Type-ahead suggests
  matching pods. Requests are mutual: they have to accept before either side
  sees anything. If they had already sent you one, sending back accepts it.
- **Requests** — incoming requests appear on the Friends tab with Accept /
  Decline, and the tab icon carries a badge. Outgoing ones can be cancelled.
- **Their board** — tap a friend to see their entire collection: every variant,
  its state and its live level, with the same All / Collected / Mastered /
  Missing filters as your own board. It is read-only; you can never edit a
  friend's pod.
- **Compare** — side-by-side totals plus four lists: what they have that you
  need, what you have that they need, variants you both own but they have
  mastered further, and what neither of you has yet.
- **Showcase** — Profile → Showcase pins up to four of your own variants to your
  profile. Friends see them on your row in their list and at the top of your
  board. You can only pin variants you actually own, and the showcase clears if
  you reset the season.
- **Unfriend** — on a friend's page, behind a confirmation. Access is revoked
  immediately for both sides.

### Privacy model

Nothing is public. A pod is visible only to accounts with an **accepted**
friendship, enforced server-side on every request — guessing a URL returns 403.
There is no directory, no leaderboard and no activity feed; user search only
matches a username prefix someone already knows, and never returns you to
yourself. Unfriending is one-sided and instant: either person can end it.

### Tables

Both are created automatically on boot, like the rest of the schema.

| Table | Holds |
|---|---|
| `friendships` | One row per pair — requester, addressee, `pending` or `accepted`, timestamps. A unique index on the ordered pair stops duplicate requests. |
| `showcase` | Up to four pinned variants per user per season, one row per slot. |

### Endpoints

All require `Authorization: Bearer <token>`.

| Method | Path | Does |
|---|---|---|
| `GET` | `/api/friends` | Friends with counts and showcases, plus incoming and outgoing requests |
| `GET` | `/api/friends/search?q=` | Username prefix search, max 8, excludes you |
| `POST` | `/api/friends/requests` | Send a request (`{ username }`); auto-accepts a reciprocal one |
| `POST` | `/api/friends/requests/:username/accept` | Accept an incoming request |
| `DELETE` | `/api/friends/:username` | Decline, cancel or unfriend — all the same removal |
| `GET` | `/api/friends/:username/pod` | A friend's full board; 403 unless the friendship is accepted |
| `GET`, `PUT` | `/api/showcase` | Read or replace your pinned variants |

---

## Environment variables

| Variable | Where | Effect |
|---|---|---|
| `VITE_API_BASE` | build time | Absolute API URL. Enables accounts on a statically hosted front end. |
| `VITE_STATIC_ONLY` | build time | `true` skips the API probe entirely — pure static build. Used by `npm run build:static`. |
| `BASE_PATH` | build time | Override Vite's base. Only needed for unusual hosting prefixes; the default relative base handles GitHub Pages. |
| `PORT` | runtime | Server port. Default `5000`. |
| `DATABASE_PATH` | runtime | SQLite file location. Point at a persistent volume in production. |
| `ALLOWED_ORIGINS` | runtime | Comma-separated origins allowed to call the API cross-origin. Only needed for Option C. |

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server, API + client, hot reload |
| `npm run build` | Production build: client + server |
| `npm run build:static` | Client-only static build, no API probe (`dist/public`) |
| `npm start` | Run the production server |
| `npm run check` | TypeScript type check |
| `npm run refresh:roster` | Check Fortnite for new Sprites and update the roster |
| `npm run sync:roster` | Copy `shared/spriteData.json` → `client/public/roster.json` |

---

## Auto-updating the roster

The app keeps itself current. You do not have to touch the data when Epic adds
Sprites, adds a new finish, or starts a new season.

### How it works

```
     every 3 hours
GitHub Actions ──▶ refresh:roster ──▶ commits changes ──▶ rebuild + deploy Pages
                        │                                          │
              reads the live Sprite list                     roster.json
              downloads any new icons                              │
                                                    installed apps fetch it on launch
```

1. **`script/refresh-roster.ts`** reads the live Sprite index at
   [fortnite.gg/sprites](https://fortnite.gg/sprites) and the current game build
   from [Fortnite-API](https://fortnite-api.com/), then rebuilds the roster.
   - New Sprites and new finishes are discovered automatically — nothing is
     hardcoded. A label ending in a shorter label ("Prism Water Sprite" vs
     "Water Sprite") is treated as a finish of it, so future variant waves are
     picked up without a code change.
   - Icons for anything new are downloaded into `client/public/sprites/`.
   - Curated metadata (rarity, drop rate, ability text) is **preserved** for
     Sprites it already knows. Newly discovered Sprites get
     `rarity: "Unknown"`, `dropRate: "—"` and `needsReview: true` until you fill
     the details in — they are fully usable in the app in the meantime.
2. **`.github/workflows/refresh-roster.yml`** runs it every 3 hours, typechecks
   and builds before committing, then calls the Pages deploy workflow.
3. **The app fetches `roster.json` at launch**, so an already-installed
   home-screen app picks up new Sprites on its next open — no reinstall, no App
   Store update. The bundled copy is the offline fallback.

### Turning it on

On your fork, one time:

- **Settings → Actions → General** — Actions enabled, and under *Workflow
  permissions* select **Read and write permissions** (the workflow needs
  `contents: write` to commit the refreshed roster).
- **Settings → Pages** — Source set to **GitHub Actions**.

That is it. The first scheduled run happens within 3 hours.

> GitHub disables scheduled workflows on repos with 60 days of no activity. The
> workflow writes a weekly heartbeat file to keep itself alive, so it will not
> quietly stop.

### Running it yourself

```bash
npm run refresh:roster              # check for changes and write them
npm run refresh:roster -- --dry-run # show what would change, write nothing
```

| Flag | Does |
|---|---|
| `--dry-run` | Report only, write nothing |
| `--force` | Apply changes even if a safety check refuses them |
| `--season-name "Voltage"` | Name the new season (rollovers only) |
| `--ends 2026-11-30` | Set the new season's end date |
| `--chapter 7` / `--season 4` | Override the detected season numbering |

You can also trigger it from **Actions → Refresh roster → Run workflow**, which
takes the same options (`dry_run`, `force`, `season_name`, `season_ends`) as
form fields.

### Safety checks

A scraped page can be half-rendered or blocked, and a bad roster would wipe
everyone's board. The script refuses to write when:

- it fetched fewer than 12 icons (page broken or blocked), or
- more than 40% of the roster vanished but fewer than 5 new Sprites appeared —
  the signature of a partial page load, as opposed to a real season reset.

A refusal exits non-zero, nothing is committed, and the live site keeps the last
good roster. Use `--force` if you have checked the page yourself and the change
is real.

### What happens at a season rollover

When most of the roster is replaced at once, the script treats it as a new
season: it bumps `season.id` (e.g. `c7s3` → `c7s4`) and rewrites the season
block. In the app:

- Your previous season is **archived, not deleted** — Profile → *Past seasons*
  keeps the last 6 seasons with their counts, and each one can be exported to
  JSON.
- The new board starts empty and a one-time banner explains what happened.
- Signed-in accounts need nothing special: progress is stored per season
  server-side, so the previous season stays intact on its own.

If the new season's end date is not public yet, the countdown shows *Date TBA*
until the next refresh picks it up.

### Editing by hand

Still entirely possible — the roster is plain data.

- Canonical file: `shared/spriteData.json` (season block, finishes and their
  bonuses, rarities, every Sprite with drop rate / ability / finishes, mastery
  milestones)
- Sprite art: `client/public/sprites/<spriteId>-<finishId>.webp`
- Run `npm run sync:roster` after editing (`dev` and both builds do it for you)

Totals are always derived from the roster — nothing is hardcoded, so counts
update themselves. Hand edits to known Sprites survive the next auto-refresh.

### Season 3 note

Sprites collected in Chapter 7 Season 3 do **not** carry into Season 4;
collections reset when the new season launches (season ends 2026-08-19). Mastering
55 variants before then earns the Quack Zero Point Sprite.

---

## Project structure

```
.github/workflows/
  refresh-roster.yml auto-update job (every 3 hours + manual run)
  deploy-pages.yml   builds and publishes the static site
script/
  refresh-roster.ts  the auto-update engine
client/
  index.html
  public/            icons, manifest, service worker, roster.json, sprites/
  src/
    App.tsx          hash routing + tab shell
    components/      Chrome (header/tabs/footer), PodTile, Stats
      Social.tsx     read-only friend board, showcase strip, gating cards
      ShowcaseEditor.tsx  pick up to four pinned variants
    lib/
      config.ts      API base + static-mode detection
      store.tsx      auth, progress, backup export/import
      roster.ts      roster types + derived totals
      social.ts      friends/showcase hooks + compare maths
      safeStorage.ts localStorage with in-memory fallback
    pages/           home, collection, mastery, profile, auth
      friends.tsx    friend list, requests, add by username
      friend.tsx     one friend's board + compare
server/
  index.ts           Express app
  cors.ts            cross-origin allowlist for split hosting
  routes.ts          /api/auth/*, /api/progress/*, /api/friends/*,
                     /api/showcase, /api/roster
  storage.ts         Drizzle + SQLite
shared/
  schema.ts          DB schema
  spriteData.json    the roster
script/build.ts      production build
.github/workflows/deploy-pages.yml
```

---

## Data & privacy

- Accounts are username + a 4–6 digit PIN. PINs are hashed with `scrypt` and a
  random per-user salt — never stored in plain text. No email is collected.
- A PIN is not a password. Don't reuse one you use elsewhere, and treat a
  public deployment as casual-security only.
- `data.db` is gitignored. Don't commit it.
- Boards are private by default. Only an accepted friend can read yours, and
  only ever read — there is no public profile, directory or leaderboard.
- If you run a public instance, you are the data controller for whatever your
  players store on it. Deleting a user's rows from `users`, `entries`,
  `friendships` and `showcase` fully removes them.

---

## Credits

Sprite data compiled from community trackers:
[spritechecklistfortnite.com](https://spritechecklistfortnite.com/),
[fortnite.bte.ar](https://fortnite.bte.ar/en),
[GamesRadar](https://www.gamesradar.com/games/fortnite/fortnite-sprites/),
[Tech Times](https://www.techtimes.com/articles/322252/20260730/fortnite-adds-20-sprites-v4130-rarest-companion-yours-free-before-season-ends.htm).
Sprite icons at 512px from [fortnite.gg](https://fortnite.gg/sprites).

Fan-made tracker. Sprite icons are from the Fortnite game files and remain the
property of Epic Games. Not affiliated with or endorsed by Epic Games.
