# ORIN: a private daily reading room

ORIN is a private route at `/orin`. The GitHub identity is checked on the server for every digest read and read/bookmark update. Only `GITHUB_REPOSITORY_OWNER` (default `sfeng01-tech`) can access data. The browser receives no database credentials, collector token, or OpenRouter key. Private API responses use `Cache-Control: private, no-store`.

GitHub sign-in creates a **server-side session**: the browser gets only an opaque, HttpOnly `portfolio_session` cookie, while the GitHub access token is encrypted (AES-256-GCM, key derived from `AUTH_SESSION_SECRET`) and stored in `orin_auth_sessions`. Sessions expire after 8 hours, are revocable, and signing out deletes the row and revokes the token with GitHub. Sessions use `AUTH_DATABASE_URL` when set, otherwise `ORIN_DATABASE_URL`. `AUTH_SESSION_STORE=memory` is a development/test fallback that refuses to run when `NODE_ENV=production`.

## Current hosting

The public portfolio is served as a Render Static Site at `https://sahil-ai-portfolio.onrender.com`. ORIN's Node web service is `https://orin-digest.onrender.com`; the static `/orin` entry redirects there. The Node adapter serves `dist` and the API handlers from the same origin, while Neon persists digests and GitHub OAuth restricts access to the repository owner. Unknown `/api/*` routes return JSON 404, not the SPA HTML.

The existing GitHub OAuth app, Render environment variables, Neon schema and Actions ingestion secrets are configured. The owner login and private digest were verified. GitHub Actions runs the daily collector independently from the Render web service. For local API preview, run `npm run build` and `npm run dev:server`, then visit `http://localhost:3000/orin`; Vite alone on port 5173 cannot authenticate or store a private digest.

Source failures appear explicitly in the digest. Login, verification and rate-limit pages are reported rather than bypassed.

Responses from the Node adapter set a Content Security Policy plus `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and HSTS on HTTPS. Vercel reads the same set from `vercel.json`. A Render static site only sends them when the service has matching dashboard header rules or is managed by the Blueprint entry in `render.yaml`. The theme bootstrap script lives at `/theme-init.js` so `script-src 'self'` works without an inline-script exception.

## Schema migrations

`apps/portfolio/server/orin-schema.sql` is additive and safe to re-run. It includes the `orin_auth_sessions` table, `orin_digests.digest_status`, indexes supporting digest membership, category lookups, feedback reads, and paper-identity suppression, and the optional `orin_reminders.due_date` column. Apply it before deploying schema-dependent API changes; an unmigrated database returns explicit 5xx errors rather than serving stale behavior. The authenticated Reminders API checks this one later-added column once per server process and adds it when absent. Its `ORIN_DATABASE_URL` role must own `orin_reminders` (or inherit ownership through a role); otherwise Reminders shows a schema-update error. In that case, run `ALTER TABLE orin_reminders ADD COLUMN IF NOT EXISTS due_date date;` as the table owner. Other ORIN pages remain available.

**Reminders.** The private reminders editor supports weekday repeats and one-time date reminders. Both use Pacific time and notify only while the ORIN page is open with browser notifications enabled. Existing reminders remain weekday repeats after the additive `due_date` migration.

## API contract

All owner endpoints require the server-side ORIN session cookie. `POST`, `PATCH`, and `DELETE` additionally require a matching `Origin` and `Content-Type: application/json`. An expired or revoked session returns JSON 401, and the UI drops back to the sign-in gate instead of showing stale digest data.

- `GET /api/orin/digest`: latest available digest, or `?date=YYYY-MM-DD` for a selected day. `?saved=true` includes bookmarked items across dates (up to 500). Response: `{date, availableDates, digest, digestStatus, items, sourceStatus}`. `availableDates` contains the last 90 digest dates.
- `PATCH /api/orin/items`: `{id, read?: boolean, saved?: boolean, feedback?: -1|0|1, category?: string|null}`. Returns `{id, read, saved, feedback, category, categorySource}`. Read/bookmark/feedback state and owner categories survive re-ingestion and carry across days for the same canonical URL.
- `PATCH /api/orin/items`: content edits accept `{id, title?, excerpt?, url?}` and return `{item}`. Manual shares support title, content/note, and source URL edits; collected YouTube videos support title/caption edits. Content edits are separate requests from read/bookmark/category updates. Owner captions are marked `titleSource: user` and survive collector retries.
- `DELETE /api/orin/items`: `{id}` hides a find from the shelf, digest/archive, collections, and saved list. The stored JSON keeps a deletion marker so collector retries cannot resurrect it; digest citations and affected summaries are pruned when read. No schema migration is required.

The video shelf at `/orin/videos` offers **Edit caption** and **Delete** on each tile. The digest offers **Edit share** on manual links/PDF text and **Delete** on all finds, with confirmation before deletion. Sign-out remains on the main ORIN page.

YouTube shares use the fixed YouTube oEmbed endpoint to capture the actual title and channel name without an API key or LLM. Watch, short, live, embed, mobile, music, and `youtu.be` links are supported. A failed/private/deleted-video lookup does not prevent saving the link. Reading the shelf or digest repairs up to 12 legacy placeholder titles per request; failed lookups rotate behind unchecked items. Owner captions are never replaced by this repair.

- `POST /api/orin/ingest`: requires `Authorization: Bearer ORIN_INGEST_TOKEN` and JSON. The token is independent of browser authentication. Returns `{count, skipped, added, members, date, mode, digestPreserved, digestItems}`. Articles already included on an earlier day are suppressed server-side, while same-day retries remain valid. Group references are pruned and affected summaries cleared to avoid describing excluded articles.

  Same-day membership is **additive**: a run adds its items to the day and the digest text is refreshed, but items an earlier run already published for that day are not removed. A partial run — a blocked source, a spent daily cap, a model outage — therefore cannot erase a richer digest, which is what previously left a day showing six finds after a thin later run. Pass `"replace": true` to opt back into swapping the day's membership outright, which is only appropriate when correcting a known-bad day. `added` reports how many of the run's items were newly attached and `members` the day's total afterwards, so a degrading source mix is visible in the run log. Shared items are upserted without losing read/bookmark state, and historical item records and bookmarks remain retained.

  Note that retained items from an earlier run can be absent from the newest digest's `groups`, because that synthesis only saw the latest payload. They still appear in the digest item list and in the brain.

  **Digest publish guard.** A same-day retry may not replace a richer digest with a thinner one: the server compares cited-item coverage (`digest.itemCount`, derived from unique group URLs) and keeps the existing digest, reporting `digestPreserved: true` and recording `digest_status: {"status":"preserved", ...}`. Pass `"replaceDigest": true` only for a deliberate correction. A `null` digest never replaces an existing one. The ingest response also reports `digestItems` so a degrading synthesis is visible in run logs.

  **Zero-item runs.** A run that collects nothing returns `mode: "skipped"` with `reason: "zero-items"` and leaves the published day, its digest, and its source status untouched.

  **Digest status.** `digestStatus` (`ok`, `unavailable`, `preserved`, `skipped`) plus a message and optional model is stored in `orin_digests.digest_status` and returned by `GET /api/orin/digest` as `digestStatus`. When summarization fails, the collector still publishes the day's items with `status: "unavailable"` rather than discarding evidence.

  **Summary fallbacks.** The collector tries `model`, then each entry in `summaryFallbackModels` (default DeepSeek then Gemini), skipping models that are unavailable, over budget, or over context. Authentication and billing failures (HTTP 401/402) stop the chain immediately. The successful model is recorded on the digest.

- `GET /api/orin/preflight?date=YYYY-MM-DD&days=30`: worker-only (ingestion token). Returns `{date, days, itemIds, paperIds, counts}` for items delivered in the `days`-day window before `date` (default 30, clamped to 1–90). The collector filters against this before ranking and summarizing, so already-delivered work never consumes model budget.

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

## Categories and segmentation

Each artifact can carry one **category** label alongside its topics, stored inside the item JSONB as `category`
plus `categorySource` (`user` or `model`). The taxonomy lives in the `orin_categories` table (seeded with the
standard classification tracks) and is fully editable in the ORIN UI:

- `GET /api/orin/categories`: list labels with item counts. The collector reads it with the ingestion token; the
  browser reads it with the GitHub session.
- `POST /api/orin/categories`: add a label (owner session, same-origin).
- `DELETE /api/orin/categories`: remove a label that no item still uses.
- `PATCH /api/orin/items` extended: `{id, category: "Agents" | null}` sets or clears an owner label. A user edit
  stamps `categorySource: user`, which survives later re-ingestion, so the model never overwrites an owner's
  decision.
- Clearing a label tombstones the item (`categorySource: user` with no `category`): the model can never re-file
  that item, on re-ingest or in a backfill run, until the owner picks a new label.
- `DELETE /api/orin/categories` extended. Labels with zero items delete directly. A label in use must declare one
  of two fates for its items: `{label, action: 'unfile'}` removes the label from every item (they fall back to
  topics and the model may re-file them later), or `{label, action: 'reassign', to: "Other"}` moves all of them
  onto another taxonomy label and stamps `categorySource: user`. The digest list carries a **Categories** manager
  next to the source filters with these buttons per row.

**Model auto-assignment.** The daily classifier (`apps/orin-collector/ranking.mjs`) receives the current taxonomy
and assigns exactly one enum label to every classified item that has no `category` yet. Owner overrides always
win; when the taxonomy is unavailable a run simply publishes without model categories. Items digested before the
feature existed can be labelled with a one-off pass:

```
npm run categories:backfill --workspace=@portfolio/orin-collector       # add -- --dry-run to preview
```

(The script needs `ORIN_DATABASE_URL` and `OPENROUTER_API_KEY` and only touches the category fields.)

**Grouping.** The brain reads `category` before topics and ranking tracks (`itemTopics` in `brainGraph.js`), so a
label change — an owner edit or a model assignment — regroups segments on the next render, with no rebuild and no
migration. `orin_search_items` in the MCP server also matches categories.

Deployment note: the `orin_categories` table must exist in Neon before the categories endpoints are used
(`apps/portfolio/server/orin-schema.sql` contains the `CREATE TABLE` plus the seed insert). The collector item
payload gained an optional `category`/`categorySource` pair, validated by `validateIngest`.

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
- **Signal board** is an isometric neural patchbay built with [Anatomy](https://github.com/wheresryan22/anatomy).
  Source jacks feed segmented topic relays and action lamps; every similar-topic cluster gets its own tray,
  with its action neurons grouped into two lanes. Source ordering follows connected-topic weight to reduce
  crossings, and coloured pulses retain each item's source. The solid base, trays, collars, neuron bodies,
  screws and ruler are projected SVG solids rather than a flat chart or a runtime 3D dependency.

The 3D view keeps the accessible panel below it as its equivalent: the canvas is a `role="img"` with a
descriptive label, and every segment, thread and item it draws is listed as a real button in the panels and on
the keyboard-navigable signal board. Under `prefers-reduced-motion` the brain stops rotating, the pulses freeze
and the canvas only repaints when something changes. No 3D library is used; the whole scene is plain math.

Implementation: `apps/portfolio/src/components/orin/OrinBrain.jsx` (views and panels),
`apps/portfolio/src/components/orin/OrinBrain3D.jsx` (canvas renderer and interaction),
`apps/portfolio/src/components/orin/brainScene.js` (pure 3D shell, neuron placement and projection),
`apps/portfolio/src/components/orin/OrinBrainMachine.jsx` and `brainMachine.js` (signal-board renderer and
geometry), `apps/portfolio/src/components/orin/brainGraph.js` (pure model, topic clustering, layout and
neighbourhood logic), and `apps/portfolio/src/components/orin/OrinBrainMachine.css`. Anatomy's MIT-licensed
isometric kit and licence are vendored under `apps/portfolio/src/components/orin/anatomy/`; no package was added.
Tests are in `apps/portfolio/tests/orin-brain.test.js` and `orin-brain-machine.test.js`.

For an authentication-free local visual review, run `npm run dev` and open
`http://localhost:5173/orin-brain-preview.html?view=board`. The fixture page is only a Vite development entry,
not a production route. Use `?view=board&theme=dark` for the dark theme or `?view=board&n=12` for a smaller
digest; omitting `view=board` opens the 3D brain. Fixture links use `example.test` and never represent live data.

## Operational limits

The collector performs comprehension and grouping before sending the digest, so API requests only validate and store data. Provider keys and browser sessions stay on the runner. Extracted content and model responses are untrusted and should be displayed as text, with external links opened safely. Popularity metrics are source-relative and may be unavailable; they are not comparable as a universal score.

There is no automatic deletion policy. To remove old daily digests while preserving bookmarks, delete `orin_digests` rows in SQL (membership cascades); orphan items remain until explicitly removed. Back up the database before bulk deletion. Use Neon database access controls and an appropriate retention policy for personal reading history.

## Provisioned resources (October 25, 2026)

- Public static portfolio: https://sahil-ai-portfolio.onrender.com
- ORIN Node service: https://orin-digest.onrender.com/orin (free plan, Oregon)
- Neon project: `muddy-dust-79837278`, database `orin`, production branch, Free organization, 0.25 CU. Schema applied.
- Public service build variable `VITE_ORIN_ORIGIN` delegates `/orin` to the Node service. Leave it unset on the Node service.
- Database connection and ingestion token are configured on the Node service; the same ingestion token and URL are stored in GitHub Actions secrets. Values are never tracked here.
- GitHub OAuth app homepage: `https://orin-digest.onrender.com/orin`; callback: `https://orin-digest.onrender.com/api/auth/callback`. Client ID and secret are configured on the Node service; owner login and authenticated digest rendering were verified. ORIN requests only `read:user`.

### Verified operational state

- Render Node service deployment is live; `/api/health` returns JSON 200.
- Anonymous session and digest endpoints return JSON 401.
- Owner GitHub sign-in completed and the private digest rendered in Safari.
- Initial Actions run succeeded: 3 items grouped into 3 threads for October 25, 2026.
- `ORIN_ENABLED=true`: daily public-feed collection runs at 14:17 UTC (07:17 PDT / 06:17 PST).
- arXiv, Hacker News and Reddit public RSS collection are enabled. X and LinkedIn collection use dedicated browser sessions when the platforms accept the saved sessions; login challenges and rate limits are reported and never bypassed.
