# ORIN: a private daily reading room

ORIN is a private route at `/orin`. The GitHub identity is checked on the server for every digest read and read/bookmark update. Only `GITHUB_REPOSITORY_OWNER` (default `sfeng01-tech`) can access data. The browser receives no database credentials, collector token, or OpenRouter key. Private API responses use `Cache-Control: private, no-store`.

## Current hosting

The public portfolio is served as a Render Static Site at `https://sahil-ai-portfolio.onrender.com`. ORIN's Node web service is `https://orin-sahil.onrender.com`; the static `/orin` entry redirects there. The Node adapter serves `dist` and the API handlers from the same origin, while Neon persists digests and GitHub OAuth restricts access to the repository owner. Unknown `/api/*` routes return JSON 404, not the SPA HTML.

The existing GitHub OAuth app, Render environment variables, Neon schema and Actions ingestion secrets are configured. The owner login and private digest were verified. GitHub Actions runs the daily collector independently from the Render web service. For local API preview, run `npm run build` and `npm run dev:server`, then visit `http://localhost:3000/orin`; Vite alone on port 5173 cannot authenticate or store a private digest.

Source failures appear explicitly in the digest. Login, verification and rate-limit pages are reported rather than bypassed.

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
- arXiv, Hacker News and Reddit public RSS collection are enabled. X and LinkedIn collection use dedicated browser sessions when the platforms accept the saved sessions; login challenges and rate limits are reported and never bypassed.
