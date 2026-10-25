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
- `POST /api/orin/ingest`: requires `Authorization: Bearer ORIN_INGEST_TOKEN` and JSON. The token is independent of browser authentication. Returns `{count, skipped, added, members, date, mode}`. Articles already included on an earlier day are suppressed server-side, while same-day retries remain valid. Group references are pruned and affected summaries cleared to avoid describing excluded articles.

  Same-day membership is **additive**: a run adds its items to the day and the digest text is refreshed, but items an earlier run already published for that day are not removed. A partial run — a blocked source, a spent daily cap, a model outage — therefore cannot erase a richer digest, which is what previously left a day showing six finds after a thin later run. Pass `"replace": true` to opt back into swapping the day's membership outright, which is only appropriate when correcting a known-bad day. `added` reports how many of the run's items were newly attached and `members` the day's total afterwards, so a degrading source mix is visible in the run log. Shared items are upserted without losing read/bookmark state, and historical item records and bookmarks remain retained.

  Note that retained items from an earlier run can be absent from the newest digest's `groups`, because that synthesis only saw the latest payload. They still appear in the digest item list and in the brain.

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

## Live actions brain

The `/orin` digest and reading-list tabs are joined by a **Live brain** tab that renders the digest as an
animated signal map instead of a list. It is derived entirely on the client from the same
`GET /api/orin/digest` payload, so it adds no API route, database table, or ingested field; it works for any
historical digest date and for the reading list.

- Three neuron layers: **source neurons** (one per data source, sized by volume and given a stable colour),
  **topic segments** in the middle, and **action neurons** (one per item) on the right.
- Topic segmentation is local and deterministic. Topics are tokenised, stop-worded and merged when their
  token overlap passes a similarity threshold, so near-duplicates such as `GPU kernels` and `ROCm kernels`
  collapse into a single segment whose label is whichever topic carried the most items. Unlabelled items fall
  into an `Unfiled` segment rather than disappearing.
- Links flow `source -> topic segment -> item`; a link only exists where an item actually connected the two,
  and its stroke weight follows the number of items behind it. Travelling dashes show direction of flow.
- Digest `groups` become **threads**: items sharing a published group are cross-referenced in the panel, so the
  model's own grouping and the local topic clustering can be compared side by side.
- Selecting any neuron focuses its two-hop neighbourhood and dims the rest. Source, segment and item details
  (fit score, discovered-vs-directed, read/saved/feedback state, outbound link) appear in the panel below.
- Neurons are keyboard-focusable `role="button"` elements with accessible labels, the map carries a
  descriptive `aria-label`, and the global `prefers-reduced-motion` rule in `index.css` disables all pulse
  animation, leaving a static dotted graph.
- A digest renders at most 40 of its highest-signal neurons (saved first, then fit score); anything beyond
  that is reported in the view and stays available in the digest list.
- The header carries the digest date and how long ago the collector last delivered anything, derived from
  `collectedAt` and `checkedAt`. When the newest digest's data is more than 30 hours old — or missing
  timestamps entirely — it reads `COLLECTOR STALLED` in a muted, non-pulsing style instead of claiming to be
  live. Looking back at an older date deliberately is not treated as a stall.
- The page refetches every 15 minutes while the tab is visible, and once more when it becomes visible again if
  the last read was over 2 minutes ago, so a tab left open overnight picks up the new digest on its own. There
  is no websocket, and hidden tabs do no work.

### Two views

A switcher in the header toggles between them; both share the same selection, focus and panel state.

- **3D brain** (default) wraps the same three-layer network inside a procedural brain. A deformed sphere
  supplies the shell, the longitudinal fissure and the gyri folds; sources sit on the left hemisphere, topic
  segments run as a spine down the midline, and action neurons sit on the right hemisphere carrying their
  source's colour, so a single idea crosses the brain from the feed that reported it to the item it produced.
  It is rendered on a `<canvas>` with a hand-rolled perspective projection, depth-bucketed shading, a smoothed
  silhouette and pulses travelling along the edges. Drag or use the arrow keys to rotate; it turns slowly on
  its own until you take hold of it. A greedy label placer keeps captions from overlapping each other or
  covering another neuron, and only near-side neurons are labelled.
- **Flow** is the flat left-to-right map, which stays the precise, keyboard-navigable reading of the same data.

The 3D view keeps the accessible panel below it as its equivalent: the canvas is a `role="img"` with a
descriptive label, and every segment, thread and item it draws is listed as a real button in the panels and in
the flow view. Under `prefers-reduced-motion` the brain stops rotating, the pulses freeze and the canvas only
repaints when something changes. No 3D library is used; the whole scene is a few hundred lines of plain math.

Implementation: `apps/portfolio/src/components/orin/OrinBrain.jsx` (views and panels),
`apps/portfolio/src/components/orin/OrinBrain3D.jsx` (canvas renderer and interaction),
`apps/portfolio/src/components/orin/brainScene.js` (pure 3D shell, neuron placement and projection),
`apps/portfolio/src/components/orin/brainGraph.js` (pure model, topic clustering, 2D layout and
neighbourhood logic); styles live at the end of `apps/portfolio/src/pages/orin.css`; tests are in
`apps/portfolio/tests/orin-brain.test.js`.

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
