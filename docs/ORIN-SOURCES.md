# ORIN daily collection

ORIN prioritizes AI systems, GPU kernels, ROCm, LLM training/inference, agents, distributed computing and research papers. The independent Node runner in `apps/orin-collector` collects source excerpts, groups related findings with OpenRouter, and publishes to the private ingestion API. The website app in `apps/portfolio` serves the authenticated reading space and Neon persists the digest; browser jobs run in GitHub Actions. The existing Render deployment is a static site and needs conversion to a Node web service before authentication and ingestion endpoints can work.

## What runs now and what needs setup

The workflow is configured with the application database, GitHub OAuth and worker secrets. Default collection uses public arXiv `cs.LG`/`cs.DC`, Hacker News RSS, and Reddit's authenticated Data API for `r/LocalLLaMA` and `r/MachineLearning`. X and LinkedIn use dedicated browser sessions when enabled; sessions may expire or be rejected by cloud IPs. There is no sample content presented as a real digest.

X and LinkedIn browser collection use normal Playwright Chromium sessions with a maximum of three configured URLs per source, three viewport snapshots per page, sequential navigation and pauses. Login walls, verification challenges and HTTP 401/403/429 stop that source for the current run. There are no stealth plugins, proxies, CAPTCHA solvers or automatic rate-limit retries. A cloud IP may require fresh manual login or may remain blocked; ORIN reports the source status and continues available feeds. Reddit uses application-only OAuth and the official Data API; configure a Reddit script app's client ID and secret as GitHub Actions secrets. The runner uses a descriptive User-Agent, one cached OAuth token per run, serial requests, and does not retry a 429 before the next scheduled run.

Only visible source excerpts are collected. Links always identify their provenance: social permalinks, Reddit RSS links, arXiv abstracts and HN discussions. Full external articles/papers are not silently fetched. Research claims remain claims from supplied abstracts. Popularity is shown only when a numeric metric was actually observed; missing metrics remain missing. Items are classified for personal relevance before digest selection, with keyword ranking as a fallback and source quotas retained. Observed engagement breaks relevance ties only among posts from the same source; cross-platform raw counts are never compared, and missing metrics remain unknown; this is a relevant daily selection, not an exhaustive popularity ranking across entire platforms. Unknown publication dates remain unknown. Site markup changes may require selector maintenance.

## Hugging Face, alphaXiv and Substack

The default and local source configurations include Hugging Face Daily Papers (up to 50 entries), alphaXiv's Hot feed over three days (up to 40 entries), and Substack feeds for **Deep (Learning) Focus** (Cameron R. Wolfe), **Interconnects AI** (Nathan Lambert), **NLP News** (Sebastian Ruder), **The Gradient**, **Ahead of AI** and **Latent Space**. They run in the existing daily workflow and require no additional API keys. Orin uses original paper abstracts and the public excerpts supplied by RSS; it does not fetch paywalled content. Source labels and filters distinguish all three in the reading room. Publication dates still follow the configured 72-hour freshness window, so an older paper newly featured on a platform can be excluded.

All four requested newsletter feeds were checked on October 25, 2026. NLP News’s latest RSS entry is dated May 13, 2024, and The Gradient’s February 19, 2026; the collector will keep checking for new entries, while the freshness window excludes these archived posts.

Hugging Face uses [`/api/daily_papers`](https://huggingface.co/docs/huggingface_hub/en/package_reference/hf_api#huggingface_hub.HfApi.list_daily_papers). alphaXiv uses its current public website endpoint, `https://api.alphaxiv.org/papers/v3/feed?sort=Hot&interval=3%20Days&pageNum=0&pageSize=40`; this website API can change, and failures appear in Collection notes without stopping other sources. Observed Hugging Face upvotes/comments and alphaXiv public votes are retained when provided.

To add a Substack publication, append `{ "source": "substack", "url": "https://PUBLICATION.substack.com/feed" }` to `feeds`. Substack documents its [publication RSS feeds](https://support.substack.com/hc/en-us/articles/360038239391-Is-there-an-RSS-feed-for-my-publication). Custom domains must also be explicitly added to the Substack allowlists in `apps/orin-collector/core.mjs` and `apps/portfolio/server/orin.js`; the configured publications' custom domains are already included. Use the final feed URL directly because collection rejects redirects.

If GitHub Actions has an `ORIN_CONFIG` variable, add the configured feed entries to that JSON too: it overrides `config.example.json`. Deploy the updated backend before running the updated collector so ingestion accepts the new source names. No database migration or additional scheduler is needed.

## Additional research, hardware and engineering sources

The existing sources are retained alongside these additions:

| Publication | Feed |
| --- | --- |
| LLMs Research | `https://llmsresearch.substack.com/feed` |
| SemiAnalysis — Dylan Patel and team | `https://newsletter.semianalysis.com/feed` |
| ModelCraft — Abi Aryan | `https://modelcraft.substack.com/feed` |
| Machine Learning Frontiers — Samuel Flender | `https://mlfrontiers.substack.com/feed` |
| Kernel Space — Dmitry Trifonov and contributors | `https://kernelspace.substack.com/feed` |
| Tim Dettmers — quantization, GPUs and deep learning | `https://timdettmers.com/feed/` |
| TheSequence | `https://thesequence.substack.com/feed` |

These feeds require no extra credentials. Public feed content is collected, with article excerpts capped at 12,000 characters; paid articles may supply previews only. Substack responses have an 8 MB bound, including the larger Cameron Wolfe and SemiAnalysis feeds. Quantization, quantized models, GPU memory and semiconductors are included in the topic list. The existing freshness and relevance filters still apply.

The existing X recent-search query now includes `from:_akhaliq` in its OR group. It shares the existing single daily request and 50-post cap with the topic search, so a particular author's posts are not guaranteed a daily slot. This uses the existing `X_API_BEARER_TOKEN`, with no second token or additional X request.

Karpathy's [arXiv Sanity Preserver](https://github.com/karpathy/arxiv-sanity-preserver) points to [arXiv Sanity Lite](https://github.com/karpathy/arxiv-sanity-lite) as its rewrite. Neither live site responded during checks on October 25, 2026, and the published applications do not expose an RSS route. As a fallback, Orin now reads direct arXiv feeds for `cs.AI`, `cs.CL`, `cs.CV`, `cs.NE` and `stat.ML`, alongside existing `cs.LG` and `cs.DC`. These are arXiv entries, not arXiv Sanity rankings or personalized recommendations. Empty weekend feeds are valid checks.

The collector and ingestion endpoint now support up to 40 source checks per run; default configuration has 32 including the two disabled browser sources. Deploy the updated backend before the expanded collector runs: earlier backends reject more than 20 source checks. `maxItems=60` and the existing model budget remain unchanged.

## Feedback-aware classification and selection

Orin uses **`xiaomi/mimo-v2.6-flash` through OpenRouter** for classification, followed by `deepseek/deepseek-v4.1-flash-1017` and `google/gemini-2.5-flash-lite` as ordered fallbacks. Digest synthesis uses the configured model (`z-ai/glm-5.3-flash`) and falls back in order through `summaryFallbackModels` (default DeepSeek V4.1 Flash 1017, then Gemini 2.5 Flash Lite). This replaces TF-IDF/SVM-style preference features with scores based on supplied text. It is an initial model choice, not a claim that any model is an ideal judge of research quality. The score measures personal relevance; it does not verify findings or assess scientific validity. [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

Before applying the old keyword gate, the worker removes stale/seen entries and deduplicates explicit arXiv identifiers across arXiv, Hugging Face Papers and alphaXiv, ignoring version suffixes. It balances the candidate pool across sources, then classifies up to 120 candidates in batches of 30, using titles and the first 700 excerpt characters. Zero-keyword candidates are eligible. This bounds coverage: entries outside the capped pool or relevant details beyond the excerpt can still be missed. Freshness remains 72 hours. New ingested records persist paper identities for cross-day suppression; historical records without that field are not backfilled automatically.

The seven interest tracks are GPU kernels, quantization, inference, training, agents, AI hardware and research. “More like this” and “Less relevant” buttons record explicit feedback (+1/-1); clicking an active button clears it. Read/saved controls remain separate. The next run retrieves up to 40 recent feedback records through the worker-only `/api/orin/preferences` endpoint and supplies at most 12 compact examples to the classifier. Existing JSON storage retains feedback during ingestion updates, so no schema migration is required.

Selection uses validated 0–100 scores, interest-track diversity and existing source quotas. Up to 15% of the item limit is reserved for discovery, which can include adjacent-interest scores and favors underrepresented tracks. Cards show the model's relevance reason and discovery label. No popularity claim is inferred from an LLM score.

Configuration defaults:

```json
"ranking": {
  "enabled": true,
  "model": "xiaomi/mimo-v2.6-flash",
  "fallbackModels": ["deepseek/deepseek-v4.1-flash-1017", "google/gemini-2.5-flash-lite"],
  "maxCandidates": 120,
  "budgetFraction": 0.4,
  "discoveryFraction": 0.15
}
```

`budgetFraction` reserves at most 40% of the existing `maxRunUsd` for classification. The worker checks current catalog support, prices and context before metered requests and trims the candidate plan to fit. It reserves the conservative estimate even for failed paid responses, subtracts it from the digest budget, and never retries the same model. This is a per-invocation price-based guard, not an account-wide spending cap. An unavailable/incompatible model, rate limit, timeout, server error or invalid/incomplete response advances once to the next configured model. All attempts share the original classification allowance; the next complete plan may classify fewer candidates to fit the remaining budget. Partial scores are discarded before switching models. Missing keys, an unavailable catalog, exhausted model choices or insufficient remaining budget use keyword ranking. Authentication/credit errors (HTTP 401/402) stop model failover because changing models cannot fix the account.  Collection notes explain the selection method and identify the model used. A feedback-fetch failure still allows classification using configured interests. `--dry-run` and `--no-model` never call the classifier. Set `ranking.enabled=false` to retain keyword selection.

On October 25, 2026, a small opt-in live smoke evaluation selected all six relevant synthetic examples, excluded two irrelevant examples and rejected an irrelevant prompt-injection example (9 total). Its conservative reservation was $0.002025, not the measured charge. This checks wiring and obvious relevance, not performance on real reader preferences or subtle papers. Continue judging recommendations with explicit feedback. Re-run it with:

```sh
OPENROUTER_API_KEY=... node apps/orin-collector/evaluate-ranking.mjs
# Existing macOS Keychain setup, with no key printed:
node apps/orin-collector/evaluate-ranking.mjs --keychain-openrouter
```

The same existing OpenRouter key is used for both stages. If `ORIN_CONFIG` overrides the example config in GitHub Actions, include `ranking` there too. Deploy the updated backend before using the feedback UI and collector.

## Comparing classifier models

A reproducible comparison of Gemini 2.5 Flash Lite, DeepSeek V4.1 Flash 1017 and MiMo V2.6 Flash on 60 real papers is saved in [the comparison report](../apps/orin-collector/benchmarks/REPORT.md). Reference labels were assigned by Codex before the requests and remain provisional until the user reviews them. The report preserves failed/experimental passes and separates observed charges (including cache discounts) from normalized uncached estimates. Following that comparison, the user selected MiMo as the primary classifier, with DeepSeek then Gemini as availability fallbacks. Digest synthesis still uses GLM.

The comparison exposed canonical-ID copying errors and overly long explanations. Classification now sends short batch-local IDs with an enum, bounds display reasons locally, then strictly validates IDs, coverage, scores and tracks before restoring canonical IDs. No freshness, source or spending limits were relaxed.

```sh
node apps/orin-collector/compare-models.mjs --plan-only
node apps/orin-collector/compare-models.mjs --keychain-openrouter --output /tmp/orin-comparison.json
```

A comparison is opt-in and metered. The script sends the exact same candidates to each model, includes a separate hypothetical-feedback arm, records usage and latency, and never silently retries or substitutes a fallback model. Each plan has a $0.10 conservative guard; this is not an account-wide cap. It does not publish a digest or change `ORIN_CONFIG`.

## GitHub Actions setup

`.github/workflows/orin-digest.yml` runs daily at 14:17 UTC (07:17 PDT, 06:17 PST), plus manual dispatch. GitHub may delay scheduled jobs. It has read-only repository permissions, no pull-request trigger, a 15-minute timeout and one job at a time. Nothing purchases a server or creates a paid service.

Add repository **Actions secrets**:

| Secret | Value |
| --- | --- |
| `ORIN_INGEST_URL` | `https://orin-digest.onrender.com/api/orin/ingest` (provisioned Node service) |
| `ORIN_INGEST_TOKEN` | Same strong 32+ character secret configured in the website's Node service |
| `OPENROUTER_API_KEY` | Existing OpenRouter credential; never use a `VITE_` variable |
| `ORIN_BROWSER_STORAGE_STATE` | Optional JSON object mapping `twitter` and `linkedin` to Playwright storage-state objects |
| `REDDIT_CLIENT_ID` | Client ID shown for your Reddit script app |
| `REDDIT_CLIENT_SECRET` | Secret shown for your Reddit script app |
| `X_API_BEARER_TOKEN` | X developer app's OAuth 2.0 Bearer Token with recent-search access |

Set the Actions variable `REDDIT_USERNAME` to the Reddit account name used to register the app. Register one at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps): choose **script**, give it a descriptive name (for example, `ORIN daily digest`), and use `http://localhost:8080` as the redirect URI. Store its client ID and secret in the two repository Actions secrets above. ORIN uses application-only OAuth for public listings; it does not need your Reddit account password or a browser session. Reddit's current Data API guidance requires OAuth from hosted-service IPs and documents rate-limit response headers; the collector makes the two configured listings serially and stops a source on 429 rather than retrying. [Reddit API guidance](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki).

X uses the v2 recent-search endpoint (one query, `max_results=50`) rather than browser automation. Before the request, GitHub Actions restores and reserves a per-Pacific-day cache marker; a same-day scheduled rerun or manual rerun skips X. This bounds ORIN to one request and at most 50 returned posts per Pacific calendar day. At X's current $0.005 per post-read price, the upper estimate is $0.25/day or about $7.50 per 30-day month when all 50 posts are returned; actual use is charged per post returned. X has moved to pay-per-use pricing, so this is not a free-tier integration. [X Developer Platform pricing](https://developer.x.com/).

Set repository **Actions variable** `ORIN_ENABLED` to `true` to enable scheduled runs. Manual workflow dispatch is available while the schedule is disabled and still checks required secrets. Set `ORIN_CONFIG` to a JSON copy of `apps/orin-collector/config.example.json` with desired sources enabled. Without that variable, the default public feeds run and social sources stay disabled. Disabled jobs or missing required secrets skip before dependency/browser installation. Do not turn on a browser source without its storage state; it will need login. Browser sessions are account credentials: use repository secrets, restrict workflow editing, and never attach them to logs, caches or artifacts. Sessions expire; renew manually when the digest reports a block. Because the runner receives source excerpts and sends them to OpenRouter, enable only material you want processed by that model/provider.

This repository is private: standard GitHub-hosted runners consume the account's included plan minutes, then billable minutes. A 5–10 minute daily job would use roughly 150–300 minutes/month, but actual duration and browser installation overhead need measurement. Check your account allowance and spending limits. [GitHub billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

For setup from a trusted workstation:

```sh
npm ci --workspace=@portfolio/orin-collector --ignore-scripts
npm exec --workspace=@portfolio/orin-collector -- playwright install chromium
cp apps/orin-collector/config.example.json apps/orin-collector/config.local.json
# Set social enabled=true for desired browser sources in config.local.json.
npm run collect --workspace=@portfolio/orin-collector -- --login twitter
npm run collect --workspace=@portfolio/orin-collector -- --login linkedin
npm run collect --workspace=@portfolio/orin-collector -- --sync-sessions --repo sfeng01-tech/Portfolio-Site
```

Each login opens a dedicated ORIN profile. Sign in manually and close the window when done. `--sync-sessions` filters each profile to its source domains and uploads the combined state directly to `ORIN_BROWSER_STORAGE_STATE` through GitHub CLI stdin. It does not print the state or write a separate session export file. Third-party identity-provider cookies and origins are excluded. Large state is gzip-compressed before storage; the worker accepts raw JSON or a `gzip:`-prefixed secret. The optional `--export-sessions` command still writes a filtered `.state/browser-sessions.json` with permissions 0600 for manual setup; do not send that file through chat, upload it as an artifact, or commit it. Some providers bind sessions to a device/IP; the cloud runner may reject an exported session, in which case leave the source disabled until a supported authorized connection is available. [Playwright authentication storage-state documentation](https://playwright.dev/docs/auth).

## Local verification and operation

Node 22 is the repository runtime. ORIN's `playwright` and `fast-xml-parser` dependencies are declared only by its workspace package; the root lockfile records the versions for the whole monorepo. Hosting installs can select only the workspace they run.

```sh
npm run test:orin
# Public feed fetch only, no model bill, no Keychain access, no publication:
npm run collect --workspace=@portfolio/orin-collector -- --once --rss-only --dry-run
```

Dry-run saves a private `.state/preview.json`; it does not advance the cursor. For publication, set the ingest URL/token and OpenRouter key in the worker environment, then run `npm run collect --workspace=@portfolio/orin-collector -- --once`. On macOS, `--keychain-openrouter` reads service `openrouter-api-key` directly into process memory only when a model call is needed; it never prints the key. On GitHub Actions, use the environment secret instead. No credential is embedded in the client build.

Each invocation is one pass; the workflow provides scheduling. Do not create an additional second scheduler for the same endpoint. A lock prevents overlapping runs on a persistent host. The worker records source checks, canonical URL deduplication, timestamps and a pending ingest payload. Local state advances only after a successful ingest, and same-day reruns rebuild the day's digest. URLs older than the configured 72-hour window are excluded when publication dates exist. Local state is pruned after 45 days; ephemeral Actions workers rely on the backend database to suppress URLs already included in earlier days and preserve read/saved state. Before classification and summarization, the collector calls `GET /api/orin/preflight?date=…&days=30` with its ingestion token and drops canonical item IDs and arXiv/paper IDs the server already delivered. A preflight failure is non-fatal: ingest still suppresses duplicates, but the model may spend budget on them. The backend prunes empty groups after removing previously delivered items. Ephemeral workers can fetch the same source post again, but it should not appear as a new digest entry on another day. Browser cursors themselves do not persist across Actions jobs. A run that collects nothing is acknowledged with `mode: "skipped"` (`reason: "zero-items"`) and leaves the published day untouched.

Ingestion uses bearer authentication and HTTPS, accepts at most 100 bounded items, and rejects arbitrary source hosts. Model outputs are validated: groups can cite only exact source URLs from the input. Retrieved text is treated as untrusted data, with no tools available to the model. A failed model response does not publish invented summaries: the day's ranked items are still published with `digestStatus.status = "unavailable"`, and the server keeps any richer same-day digest that already exists (`digestPreserved`). `--no-model` is an explicit operator option to publish raw findings without AI grouping. A conservative price/context check runs before each model call; provider prices are capped, output tokens bounded, and paid requests are not automatically retried. A failed summary attempt advances to the next configured fallback model, except for HTTP 401/402, where a different model cannot help. The configured run budget is a guard based on advertised token rates, not an account-wide billing cap; also configure an OpenRouter key credit limit.

## OpenRouter recommendation, checked October 25, 2026

I recommend **`z-ai/glm-5.3-flash` as the initial value default**, then compare a week of ORIN digests with `deepseek/deepseek-v4.1-flash-1017` before deciding which produces better technical groups. This is an inference from the current prices, usage and published benchmarks, not an ORIN-specific quality evaluation.

[OpenRouter's leaderboard](https://openrouter.ai/rankings) reports usage through October 24: DeepSeek V4.1 Flash 1017 leads the daily token-volume table, GLM 5.3 Flash is third, and MiMo V2.6 Flash is tenth. The table measures tokens processed, not factual accuracy or value. Its separate benchmark table provides task performance context. Attribution: rankings data by OpenRouter, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

| Model | Input / output per 1M tokens | Example daily cost | 30 days | Role |
| --- | --- | --- | --- | --- |
| [GLM 5.3 Flash](https://openrouter.ai/z-ai/glm-5.3-flash) | $0.0513 / $0.0701 | $0.00278 | $0.083 | Default grouping and synthesis |
| [DeepSeek V4.1 Flash 1017](https://openrouter.ai/deepseek/deepseek-v4.1-flash-1017) | $0.02 / $1.00 | $0.00400 | $0.120 | Strong usage signal; compare on dense research |
| [MiMo V2.6 Flash](https://openrouter.ai/xiaomi/mimo-v2.6-flash) | $0.091 / $0.182 | $0.00510 | $0.153 | Low-cost alternate provider/model family |
| [Gemini 2.5 Flash Lite](https://openrouter.ai/google/gemini-2.5-flash-lite) | $0.10 / $0.40 | $0.00620 | $0.186 | Lightweight classification alternate |

Example assumes 50,000 input + 3,000 output tokens for one daily call, without caching discounts, retries, separate reasoning tokens, taxes/credit fees or hosting costs. Rates are displayed starting prices and vary by provider and promotions; the runner rechecks availability/pricing using the [models endpoint](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties). Prices and ranks can change. Digest synthesis uses GLM; a separate bounded Flash Lite classification pass now ranks candidates first, as described below. Free model tiers are an optional experiment, not the default because their limits and availability can disrupt a daily job.

Mandatory reasoning models are handled using their advertised supported effort levels. GLM 5.3 Flash requires reasoning, so ORIN uses low effort and omits reasoning text from the response. The 6,000-token output ceiling includes both internal reasoning and visible JSON output; budget checks include the full ceiling.
