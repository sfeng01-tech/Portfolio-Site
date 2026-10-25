# ORIN daily collection

ORIN prioritizes AI systems, GPU kernels, ROCm, LLM training/inference, agents, distributed computing and research papers. The independent Node runner in `scripts/orin` collects source excerpts, groups related findings with OpenRouter, and publishes to the private ingestion API. The website's Node service serves the authenticated reading space and Neon persists the digest; browser jobs run in GitHub Actions. The existing Render deployment is a static site and needs conversion to a Node web service before authentication and ingestion endpoints can work.

## What runs now and what needs setup

The workflow is configured with the application database, GitHub OAuth and worker secrets. Default collection uses public arXiv `cs.LG`/`cs.DC`, Hacker News RSS, and Reddit's authenticated Data API for `r/LocalLLaMA` and `r/MachineLearning`. X and LinkedIn use dedicated browser sessions when enabled; sessions may expire or be rejected by cloud IPs. There is no sample content presented as a real digest.

X and LinkedIn browser collection use normal Playwright Chromium sessions with a maximum of three configured URLs per source, three viewport snapshots per page, sequential navigation and pauses. Login walls, verification challenges and HTTP 401/403/429 stop that source for the current run. There are no stealth plugins, proxies, CAPTCHA solvers or automatic rate-limit retries. A cloud IP may require fresh manual login or may remain blocked; ORIN reports the source status and continues available feeds. Reddit uses application-only OAuth and the official Data API; configure a Reddit script app's client ID and secret as GitHub Actions secrets. The runner uses a descriptive User-Agent, one cached OAuth token per run, serial requests, and does not retry a 429 before the next scheduled run.

Only visible source excerpts are collected. Links always identify their provenance: social permalinks, Reddit RSS links, arXiv abstracts and HN discussions. Full external articles/papers are not silently fetched. Research claims remain claims from supplied abstracts. Popularity is shown only when a numeric metric was actually observed; missing metrics remain missing. Items are prioritized by topic matches and recency with source quotas. Observed engagement breaks relevance ties only among posts from the same source; cross-platform raw counts are never compared, and missing metrics remain unknown; this is a relevant daily selection, not an exhaustive popularity ranking across entire platforms. Unknown publication dates remain unknown. Site markup changes may require selector maintenance.

## Hugging Face, alphaXiv and Substack

The default and local source configurations include Hugging Face Daily Papers (up to 50 entries), alphaXiv's Hot feed over three days (up to 40 entries), and Substack feeds for **Deep (Learning) Focus** (Cameron R. Wolfe), **Interconnects AI** (Nathan Lambert), **NLP News** (Sebastian Ruder), **The Gradient**, **Ahead of AI** and **Latent Space**. They run in the existing daily workflow and require no additional API keys. Orin uses original paper abstracts and the public excerpts supplied by RSS; it does not fetch paywalled content. Source labels and filters distinguish all three in the reading room. Publication dates still follow the configured 72-hour freshness window, so an older paper newly featured on a platform can be excluded.

All four requested newsletter feeds were checked on October 25, 2026. NLP News’s latest RSS entry is dated May 13, 2024, and The Gradient’s February 19, 2026; the collector will keep checking for new entries, while the freshness window excludes these archived posts.

Hugging Face uses [`/api/daily_papers`](https://huggingface.co/docs/huggingface_hub/en/package_reference/hf_api#huggingface_hub.HfApi.list_daily_papers). alphaXiv uses its current public website endpoint, `https://api.alphaxiv.org/papers/v3/feed?sort=Hot&interval=3%20Days&pageNum=0&pageSize=40`; this website API can change, and failures appear in Collection notes without stopping other sources. Observed Hugging Face upvotes/comments and alphaXiv public votes are retained when provided.

To add a Substack publication, append `{ "source": "substack", "url": "https://PUBLICATION.substack.com/feed" }` to `feeds`. Substack documents its [publication RSS feeds](https://support.substack.com/hc/en-us/articles/360038239391-Is-there-an-RSS-feed-for-my-publication). Custom domains must also be explicitly added to the Substack allowlists in `scripts/orin/core.mjs` and `server/orin.js`; the configured publications' custom domains are already included. Use the final feed URL directly because collection rejects redirects.

If GitHub Actions has an `ORIN_CONFIG` variable, add the configured feed entries to that JSON too: it overrides `config.example.json`. Deploy the updated backend before running the updated collector so ingestion accepts the new source names. No database migration or additional scheduler is needed.

## GitHub Actions setup

`.github/workflows/orin-digest.yml` runs daily at 14:17 UTC (07:17 PDT, 06:17 PST), plus manual dispatch. GitHub may delay scheduled jobs. It has read-only repository permissions, no pull-request trigger, a 15-minute timeout and one job at a time. Nothing purchases a server or creates a paid service.

Add repository **Actions secrets**:

| Secret | Value |
| --- | --- |
| `ORIN_INGEST_URL` | `https://orin-sahil.onrender.com/api/orin/ingest` (provisioned Node service) |
| `ORIN_INGEST_TOKEN` | Same strong 32+ character secret configured in the website's Node service |
| `OPENROUTER_API_KEY` | Existing OpenRouter credential; never use a `VITE_` variable |
| `ORIN_BROWSER_STORAGE_STATE` | Optional JSON object mapping `twitter` and `linkedin` to Playwright storage-state objects |
| `REDDIT_CLIENT_ID` | Client ID shown for your Reddit script app |
| `REDDIT_CLIENT_SECRET` | Secret shown for your Reddit script app |
| `X_API_BEARER_TOKEN` | X developer app's OAuth 2.0 Bearer Token with recent-search access |

Set the Actions variable `REDDIT_USERNAME` to the Reddit account name used to register the app. Register one at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps): choose **script**, give it a descriptive name (for example, `ORIN daily digest`), and use `http://localhost:8080` as the redirect URI. Store its client ID and secret in the two repository Actions secrets above. ORIN uses application-only OAuth for public listings; it does not need your Reddit account password or a browser session. Reddit's current Data API guidance requires OAuth from hosted-service IPs and documents rate-limit response headers; the collector makes the two configured listings serially and stops a source on 429 rather than retrying. [Reddit API guidance](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki).

X uses the v2 recent-search endpoint (one query, `max_results=50`) rather than browser automation. Before the request, GitHub Actions restores and reserves a per-Pacific-day cache marker; a same-day scheduled rerun or manual rerun skips X. This bounds ORIN to one request and at most 50 returned posts per Pacific calendar day. At X's current $0.005 per post-read price, the upper estimate is $0.25/day or about $7.50 per 30-day month when all 50 posts are returned; actual use is charged per post returned. X has moved to pay-per-use pricing, so this is not a free-tier integration. [X Developer Platform pricing](https://developer.x.com/).

Set repository **Actions variable** `ORIN_ENABLED` to `true` to enable scheduled runs. Manual workflow dispatch is available while the schedule is disabled and still checks required secrets. Set `ORIN_CONFIG` to a JSON copy of `scripts/orin/config.example.json` with desired sources enabled. Without that variable, the default public feeds run and social sources stay disabled. Disabled jobs or missing required secrets skip before dependency/browser installation. Do not turn on a browser source without its storage state; it will need login. Browser sessions are account credentials: use repository secrets, restrict workflow editing, and never attach them to logs, caches or artifacts. Sessions expire; renew manually when the digest reports a block. Because the runner receives source excerpts and sends them to OpenRouter, enable only material you want processed by that model/provider.

This repository is private: standard GitHub-hosted runners consume the account's included plan minutes, then billable minutes. A 5–10 minute daily job would use roughly 150–300 minutes/month, but actual duration and browser installation overhead need measurement. Check your account allowance and spending limits. [GitHub billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

For setup from a trusted workstation:

```sh
npm ci --prefix scripts/orin
npm exec --prefix scripts/orin -- playwright install chromium
cp scripts/orin/config.example.json scripts/orin/config.local.json
# Set social enabled=true for desired browser sources in config.local.json.
node scripts/orin/collect.mjs --login twitter
node scripts/orin/collect.mjs --login linkedin
node scripts/orin/collect.mjs --sync-sessions --repo sfeng01-tech/Portfolio-Site
```

Each login opens a dedicated ORIN profile. Sign in manually and close the window when done. `--sync-sessions` filters each profile to its source domains and uploads the combined state directly to `ORIN_BROWSER_STORAGE_STATE` through GitHub CLI stdin. It does not print the state or write a separate session export file. Third-party identity-provider cookies and origins are excluded. Large state is gzip-compressed before storage; the worker accepts raw JSON or a `gzip:`-prefixed secret. The optional `--export-sessions` command still writes a filtered `.state/browser-sessions.json` with permissions 0600 for manual setup; do not send that file through chat, upload it as an artifact, or commit it. Some providers bind sessions to a device/IP; the cloud runner may reject an exported session, in which case leave the source disabled until a supported authorized connection is available. [Playwright authentication storage-state documentation](https://playwright.dev/docs/auth).

## Local verification and operation

Node 20.19+ is required (Node 22 recommended). Worker dependencies are isolated from the website package: `playwright` and `fast-xml-parser`, pinned by `scripts/orin/package-lock.json`.

```sh
npm test --prefix scripts/orin
# Public feed fetch only, no model bill, no Keychain access, no publication:
node scripts/orin/collect.mjs --once --rss-only --dry-run
```

Dry-run saves a private `.state/preview.json`; it does not advance the cursor. For publication, set the ingest URL/token and OpenRouter key in the worker environment, then run `node scripts/orin/collect.mjs --once`. On macOS, `--keychain-openrouter` reads service `openrouter-api-key` directly into process memory only when a model call is needed; it never prints the key. On GitHub Actions, use the environment secret instead. No credential is embedded in the client build.

Each invocation is one pass; the workflow provides scheduling. Do not create an additional second scheduler for the same endpoint. A lock prevents overlapping runs on a persistent host. The worker records source checks, canonical URL deduplication, timestamps and a pending ingest payload. Local state advances only after a successful ingest, and same-day reruns rebuild the day's digest. URLs older than the configured 72-hour window are excluded when publication dates exist. Local state is pruned after 45 days; ephemeral Actions workers rely on the backend database to suppress URLs already included in earlier days and preserve read/saved state. The backend prunes empty groups after removing previously delivered items. Ephemeral workers can fetch the same source post again, but it should not appear as a new digest entry on another day. Browser cursors themselves do not persist across Actions jobs.

Ingestion uses bearer authentication and HTTPS, accepts at most 100 bounded items, and rejects arbitrary source hosts. Model outputs are validated: groups can cite only exact source URLs from the input. Retrieved text is treated as untrusted data, with no tools available to the model. A failed model response does not publish invented summaries. `--no-model` is an explicit operator option to publish raw findings without AI grouping. A conservative price/context check runs before each model call; provider prices are capped, output tokens bounded, and paid requests are not automatically retried. The configured run budget is a guard based on advertised token rates, not an account-wide billing cap; also configure an OpenRouter key credit limit.

## OpenRouter recommendation, checked October 25, 2026

I recommend **`z-ai/glm-5.3-flash` as the initial value default**, then compare a week of ORIN digests with `deepseek/deepseek-v4.1-flash-1017` before deciding which produces better technical groups. This is an inference from the current prices, usage and published benchmarks, not an ORIN-specific quality evaluation.

[OpenRouter's leaderboard](https://openrouter.ai/rankings) reports usage through October 24: DeepSeek V4.1 Flash 1017 leads the daily token-volume table, GLM 5.3 Flash is third, and MiMo V2.6 Flash is tenth. The table measures tokens processed, not factual accuracy or value. Its separate benchmark table provides task performance context. Attribution: rankings data by OpenRouter, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

| Model | Input / output per 1M tokens | Example daily cost | 30 days | Role |
| --- | --- | --- | --- | --- |
| [GLM 5.3 Flash](https://openrouter.ai/z-ai/glm-5.3-flash) | $0.0513 / $0.0701 | $0.00278 | $0.083 | Default grouping and synthesis |
| [DeepSeek V4.1 Flash 1017](https://openrouter.ai/deepseek/deepseek-v4.1-flash-1017) | $0.02 / $1.00 | $0.00400 | $0.120 | Strong usage signal; compare on dense research |
| [MiMo V2.6 Flash](https://openrouter.ai/xiaomi/mimo-v2.6-flash) | $0.091 / $0.182 | $0.00510 | $0.153 | Low-cost alternate provider/model family |
| [Gemini 2.5 Flash Lite](https://openrouter.ai/google/gemini-2.5-flash-lite) | $0.10 / $0.40 | $0.00620 | $0.186 | Lightweight classification alternate |

Example assumes 50,000 input + 3,000 output tokens for one daily call, without caching discounts, retries, separate reasoning tokens, taxes/credit fees or hosting costs. Rates are displayed starting prices and vary by provider and promotions; the runner rechecks availability/pricing using the [models endpoint](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties). Prices and ranks can change. The initial implementation uses one model call for grouping; a separate filtering model is unnecessary at this volume. Free model tiers are an optional experiment, not the default because their limits and availability can disrupt a daily job.

Mandatory reasoning models are handled using their advertised supported effort levels. GLM 5.3 Flash requires reasoning, so ORIN uses low effort and omits reasoning text from the response. The 6,000-token output ceiling includes both internal reasoning and visible JSON output; budget checks include the full ceiling.
