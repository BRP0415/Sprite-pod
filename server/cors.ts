import type { Request, Response, NextFunction } from "express";

/**
 * Cross-origin access for split hosting — a static front end (e.g. GitHub
 * Pages) talking to this API on a separate Node host.
 *
 * Set ALLOWED_ORIGINS to a comma-separated list of origins, for example:
 *   ALLOWED_ORIGINS=https://yourname.github.io
 *
 * Leave it unset for same-origin deployments (the server serves the front end
 * itself), which need no CORS headers at all. "*" allows any origin — fine for
 * a personal tracker, but it does mean any site can call your API.
 */
const allowed = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

export function cors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  const permitted =
    !!origin && (allowed.includes("*") || allowed.includes(origin.replace(/\/+$/, "")));

  if (permitted) {
    res.header("Access-Control-Allow-Origin", origin!);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.header("Access-Control-Max-Age", "86400");
  }

  if (req.method === "OPTIONS") {
    res.sendStatus(permitted ? 204 : 403);
    return;
  }

  next();
}
