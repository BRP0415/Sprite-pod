/**
 * Where the API lives.
 *
 * Three cases, in priority order:
 *  1. VITE_API_BASE is set at build time -> use it (e.g. a Render/Fly backend
 *     while the frontend is hosted on GitHub Pages).
 *  2. The Perplexity deploy pipeline rewrites the "__PORT_5000__" token below
 *     into an absolute proxy URL -> use that.
 *  3. Neither -> empty string, meaning "same origin". A plain `npm run dev`
 *     or `npm start` hits its own Express server this way.
 *
 * If none of these can actually be reached (a static-only host such as GitHub
 * Pages with no backend), the store falls back to the bundled roster and
 * device-local progress. See client/src/lib/store.tsx.
 */
const injectedBase = "__PORT_5000__";
const envBase = (import.meta.env.VITE_API_BASE ?? "").trim().replace(/\/+$/, "");

export const API_BASE = envBase || (injectedBase.startsWith("__") ? "" : injectedBase);

/** Set VITE_STATIC_ONLY=true to skip the backend probe entirely. */
export const FORCE_STATIC = String(import.meta.env.VITE_STATIC_ONLY ?? "") === "true";
