# ORIN: a private daily reading room

ORIN is a private route at `/orin`. The GitHub identity is checked on the server for every digest read and read/bookmark update. Only `GITHUB_REPOSITORY_OWNER` (default `sfeng01-tech`) can access data. The browser receives no database credentials, collector token, or OpenRouter key. Private API responses use `Cache-Control: private, no-store`.

## Hosting requirement

The current Render service is a **Static Site**, which cannot execute `/api/*` handlers. ORIN requires a Render **Web Service** (Node 20+) or a Vercel project running the Node handlers. For Render, build with `npm ci && npm run build` and start with `npm start` (`node server/http.js`). Preserve the existing static service until the web service and its custom domain are verified. Set environment variables on the web service and update the GitHub OAuth callback to that service's canonical domain. The optional `render-web.yaml` blueprint describes this migration; it does not automatically convert a Static Site.

The Node adapter serves `dist` and the existing API handlers from one origin. Unknown `/api/*` routes return JSON 404, not the SPA HTML. In local development, run the API server alongside Vite with the configured API proxy. Plain static hosting can still show public pages and the ORIN sign-in shell, but cannot authenticate or store a private digest.

## Current hosting: Render static → Node API support

The existing live URL is `https://sahil-ai-portfolio.onrender.com`. Its current Render service uses `runtime: static` in `render.yaml`. Static hosting does **not** execute the `api/` files: `/api/auth/session` currently returns the SPA HTML. Hiding portfolio sections works on that deployment; private ORIN requires the Node runtime below. A GitHub push alone cannot convert a Render Static Site into a Node Web Service.

`render.yaml` is intentionally retained so the current static deployment keeps working. `render-node.yaml` is an optional blueprint for a **new** free Node web service, not a change to the existing service. Configure it in Render or create a Node Web Service manually with:

- Repository: `sfeng01-tech/Portfolio-Site`, branch `main`.
- Build: `npm ci && npm run build`.
- Start: `npm start`.
- Node: 22; health check: `/api/health`.
- Free plan: use the dashboard's current free option; confirm availability before creating a service. Cold starts are expected.

Render allocates the new service its own URL. Set the new origin everywhere below. Keeping the old hostname requires a deliberate hostname/service migration in Render; do not point the worker at the old static service. GitHub Actions runs the daily collector independently of whether the website service is sleeping.

## Deployment setup

1. Use the existing GitHub OAuth application's `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` as **server environment variables** on the Node service. Its authorization callback must be `https://YOUR_NODE_SERVICE_DOMAIN/api/auth/callback`. Set `APP_ORIGIN` to that exact origin. The existing owner-only admin OAuth/session is reused; ORIN sign-in returns to `/orin`.
2. Create a free Neon Postgres database. Add its pooled connection string to the Node service as `ORIN_DATABASE_URL`. Run [`server/orin-schema.sql`](../server/orin-schema.sql) once in Neon's SQL editor. Do not put this URL in any `VITE_` variable. Never commit the connection string.
3. Generate an independent random ingestion secret (`openssl rand -hex 32`). Add it as `ORIN_INGEST_TOKEN` to the Node service and the matching GitHub Actions secret. Never reuse the OAuth secret or OpenRouter key.
4. Redeploy after environment configuration. `/api/auth/session` and `/api/orin/digest` must return JSON 401 when logged out, not HTML 200. For the owner, ORIN returns 503 until storage is configured, then an empty state until collection succeeds.
5. Configure the GitHub Actions worker described in [`ORIN-SOURCES.md`](ORIN-SOURCES.md). Set the exact new ingestion URL `https://YOUR_NODE_SERVICE_DOMAIN/api/orin/ingest`, OpenRouter secret, and optional browser session secrets. No browser runs in the website server. Keep the schedule disabled until these are configured.
6. Visit `/orin`, sign in with the repository owner (`sfeng01-tech`), manually dispatch one collection and verify a real digest before enabling daily runs.

Local API preview: `npm run build` then `npm run dev:server`; visit `http://localhost:3000/orin`. Store local server settings in ignored `.env.local`. Vite on port 5173 previews layout only and cannot run these API handlers.

A code deployment alone does not provision Neon, set OAuth secrets, authenticate social accounts or activate collection. Source failures appear explicitly in the digest. Login/challenge/rate-limit pages are reported rather than bypassed.

## API contract

All owner endpoints require the existing HttpOnly GitHub session cookie. `PATCH` additionally requires a matching `Origin` and `Content-Type: application/json`.

- `GET /api/orin/digest`: latest available digest, or `?date=YYYY-MM-DD` for a selected day. `?saved=true` includes bookmarked items across dates (up to 500). Response: `{date, availableDates, digest, items, sourceStatus}`. `availableDates` contains the last 90 digest dates.
- `PATCH /api/orin/items`: `{id, read?: boolean, saved?: boolean}`. Returns `{id, read, saved}`. Read/bookmark state survives re-ingestion and carries across days for the same canonical URL.
- `POST /api/orin/ingest`: requires `Authorization: Bearer ORIN_INGEST_TOKEN` and JSON. The token is independent of browser authentication. Returns `{count, skipped, date}`. Articles already included on an earlier day are suppressed server-side, while same-day retries remain valid. Group references are pruned and affected summaries cleared to avoid describing excluded articles. Each run atomically replaces that day's membership and digest; shared items are upserted without losing read/bookmark state. Historical item records and bookmarks remain retained.

Example ingestion payload (up to 100 items and 2 MB):

```json
{
  "date": "2026-10-25",
  "items": [
    {
      "source": "arxiv",
      "url": "https://arxiv.org/abs/2601.12345",
      "title": "Example research title",
      "excerpt": "Source excerpt, treated as untrusted text.",
      "author": "Example author",
      "publishedAt": "2026-10-25T08:00:00.000Z",
      "collectedAt": "2026-10-25T09:00:00.000Z",
      "metrics": {"likes": 0, "reposts": 0, "comments": 0, "score": 0},
      "topics": ["GPU kernels"]
    }
  ],
  "digest": {
    "title": "Today's systems reading",
    "summary": "A grounded synthesis with links below.",
    "groups": [
      {"title": "GPU kernels", "summary": "What connects these items.", "urls": ["https://arxiv.org/abs/2601.12345"]}
    ]
  },
  "sourceStatus": [
    {"source": "twitter", "status": "blocked", "message": "Login required", "checkedAt": "2026-10-25T09:00:00.000Z"}
  ]
}
```

Sources are `twitter`, `linkedin`, `reddit`, `arxiv`, `hackernews`, and `rss`. Source-specific URLs must match their service host; RSS may link to other public HTTPS hosts. Article IDs are derived server-side from canonical URLs, with fragments and common tracking parameters removed. Group URLs must reference an ingested item. Titles, excerpts, topics, timestamps, popularity metrics and model output are validated; arbitrary HTML is never required by this contract. No network fetching occurs from ingested URLs in the API.

## Operational limits

The collector performs comprehension and grouping before sending the digest, so API requests only validate and store data. Provider keys and browser sessions stay on the runner. Extracted content and model responses are untrusted and should be displayed as text, with external links opened safely. Popularity metrics are source-relative and may be unavailable; they are not comparable as a universal score.

There is no automatic deletion policy. To remove old daily digests while preserving bookmarks, delete `orin_digests` rows in SQL (membership cascades); orphan items remain until explicitly removed. Back up the database before bulk deletion. Use Neon database access controls and an appropriate retention policy for personal reading history.

## Provisioned resources (October 25, 2026)

- Public static portfolio: https://sahil-ai-portfolio.onrender.com
- ORIN Node service: https://orin-sahil.onrender.com/orin (free plan, Oregon)
- Neon project: `muddy-dust-79837278`, database `orin`, production branch, Free organization, 0.25 CU. Schema applied.
- Public service build variable `VITE_ORIN_ORIGIN` delegates `/orin` to the Node service. Leave it unset on the Node service.
- Database connection and ingestion token are configured on the Node service; the same ingestion token and URL are stored in GitHub Actions secrets. Values are never tracked here.
- GitHub OAuth app homepage: `https://orin-sahil.onrender.com/orin`; callback: `https://orin-sahil.onrender.com/api/auth/callback`. Client ID and secret are configured on the Node service; owner login and authenticated digest rendering were verified. ORIN requests only `read:user`.

### Verified operational state

- Render Node service deployment is live; `/api/health` returns JSON 200.
- Anonymous session and digest endpoints return JSON 401.
- Owner GitHub sign-in completed and the private digest rendered in Safari.
- Initial Actions run succeeded: 3 items grouped into 3 threads for October 25, 2026.
- `ORIN_ENABLED=true`: daily public-feed collection runs at 14:17 UTC (07:17 PDT / 06:17 PST).
- arXiv and Hacker News collection are enabled. X, LinkedIn and Reddit remain disabled pending dedicated authenticated browser sessions; no existing Safari cookies are copied.
