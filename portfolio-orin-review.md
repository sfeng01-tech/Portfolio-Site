# Portfolio Site + ORIN Review

**Repository:** `sfeng01-tech/Portfolio-Site`  
**Commit reviewed:** `12f734d` (October 25, 2026)  
**Review type:** Read-only code, product, and architecture review  
**Files changed:** None

This is a plain-English version of the technical review. File references are included so an engineer can go straight to the relevant code.

---

## 1. Executive summary

The site is in better shape than most portfolio projects. There is no obvious zero-click break-in vulnerability. The database queries are safely written, the collector checks where links come from, model output is validated, and the visual work is thoughtful.

The problems are concentrated in four areas:

1. **Login security.** Admin sign-in stores a powerful GitHub key in a browser cookie. Logging out does not revoke that key.
2. **Publishing reliability.** A thin collection day can replace a rich digest with a poor one, and one summary failure can throw away the whole day’s work.
3. **Data and search.** ORIN is still a daily digest with a keyword filter. It does not yet have a durable knowledge base, meaning-based search, or a way to identify what is missing.
4. **Front-end weight.** Every visitor downloads the blog’s markdown and code-highlighting code, even though both current posts are external links.

ORIN’s larger opportunity is product, not code. It is currently a well-designed **daily reading room**. It should become an **idea-to-evidence research desk**: a place where a rough idea becomes a cited evidence brief, a list of gaps, and a testable next experiment.

### The five highest-leverage actions

1. Move the GitHub access key off the browser and revoke it on logout.
2. Protect the digest from thin overwrites and summary failures.
3. Filter out already-delivered items before paying a model to rank and summarize them.
4. Lazy-load the blog and fix or remove the contact form.
5. Build the persistent knowledge layer: 11 buckets, structured claims, hybrid search, gap analysis, and an “Ask ORIN” workbench.

---

## 2. What I checked

I reviewed the repository in five parallel tracks:

- backend, authentication, database, and deployment;
- front-end performance and user experience;
- collector, ranking, and data pipeline;
- ORIN product strategy;
- retrieval and chatbot architecture.

I also ran the production build and the test suites.

**Build results:**

- Main entry JavaScript: **569.59 kB**, or **176.85 kB compressed**.
- Admin layout: **311.58 kB**, or **82.56 kB compressed**.
- ORIN page: **58.01 kB**, or **20.85 kB compressed**.
- A trial that lazy-loaded the blog pages reduced the entry to **223.28 kB**, or **72.89 kB compressed**.

**Tests:**

- The portfolio, collector, and MCP tests pass on Node 22, which is the version the project supports.
- The machine’s default Node 18 fails three tests because the API files use modern module syntax. The repository requires Node `>=20.19` and CI uses Node 22, so this is an environment mismatch, not a product bug.
- `npm audit` reports 15 vulnerabilities total, including 4 high and 1 moderate in production dependencies.

---

## 3. What is already good

These are worth preserving:

- **Database safety.** Queries are parameterized, so user input is not pasted into SQL.
- **Token comparison.** Ingest and OAuth state checks use timing-safe comparison.
- **Source checks.** Ingest URLs are checked against the expected source hosts.
- **Model-output checks.** Rankings, categories, URLs, and digest groups are validated before storage.
- **Prompt-injection posture.** The collector tells the model to treat source text as untrusted, and the model gets no tools.
- **Citation checks.** Digest group links must point to items that were actually ingested.
- **Visual accessibility.** The 3D brain respects reduced-motion settings, caps device pixel ratio, and has an accessible panel below it.
- **Test coverage.** Parsing, validation, ranking, and brain logic have useful tests.

The issue is not that the code is careless. The issue is that the system has outgrown the original “one daily digest” design.

---

## 4. High-priority problems

### 4.1 The admin login keeps a powerful GitHub key in the browser

**Priority:** High  
**Where:** `api/auth/login.js:24`, `api/auth/callback.js:80-84`, `api/auth/logout.js:15-18`, `apps/portfolio/server/githubAuth.js:89-113`

**What happens:** When the owner signs in to the admin area, the site asks GitHub for the `repo` permission. That permission can read and write private repositories. GitHub returns an access key, and the site stores that key in a browser cookie for eight hours. The key is sent back to the server on every request.

Logging out deletes the browser cookie, but it does not tell GitHub to revoke the key. The eight-hour limit only removes the browser copy.

**Why it matters:** Anyone who obtains that cookie can read and write every private repository the owner can access. This is the largest security risk in the review. The UI and documentation also imply the credential expires after eight hours, which is not true of the key itself.

**The fix:**

- Keep the GitHub access key on the server.
- Give the browser a random session ID in a secure, HttpOnly cookie instead.
- Store the key encrypted, or use a GitHub App limited to this repository.
- Revoke the key when the user logs out.
- Ask for the smallest permission possible.

**Effort:** Medium to large.

---

### 4.2 A bad collection day can replace a good digest with a thin one

**Priority:** High  
**Where:** `apps/orin-collector/collect.mjs:164-165`, `api/orin/ingest.js:19`, `apps/portfolio/server/orin.js:115-129`

**What happens:** The collector always publishes, even if it found zero items. The ingest endpoint always replaces the stored digest text. If a later same-day run is thin, it can replace a rich digest with a thin one.

The item list is additive, but the summary text is not. A three-item retry can replace a forty-item day’s synthesis with a three-item one.

**Why it matters:** A weekend, an outage, a blocked source, or a manual rerun can make the day look empty or degrade its summary. The documentation promises that a thin run cannot erase a richer digest, but the code does not fully enforce that.

**The fix:**

- Never replace a non-null digest with `null`.
- Store how many items the digest covers.
- Require the new digest to cover at least as many items as the old one, unless an explicit `replaceDigest` flag is set.
- Skip publishing when zero items were found and a same-day digest already exists.

**Effort:** Medium.

---

### 4.3 One summary failure throws away the whole day

**Priority:** High  
**Where:** `apps/orin-collector/collect.mjs:162`, `apps/orin-collector/summarize.mjs:11-44`

**What happens:** The summary step uses one model and has no fallback list. Any provider outage, timeout, or malformed response throws an error before the items are published.

Ranking degrades gracefully across three models. Summarization does not.

**Why it matters:** A model outage can discard a full day of collection, including the source status that would explain what happened.

**The fix:**

- Add fallback models for the summary.
- If all summary attempts fail, still publish the items with no digest and a clear explanation in the status.
- Never let a summary failure block the raw evidence.

**Effort:** Small.

---

### 4.4 The system pays the model to process items it will later remove

**Priority:** High  
**Where:** `apps/orin-collector/ranking.mjs:16-23`, `api/orin/ingest.js:11-12`, `apps/orin-collector/collect.mjs:157-162`

**What happens:** Before ranking, the collector only checks a local “seen” list. GitHub Actions workers do not remember previous runs. The server removes items that already appeared on an earlier day, but that happens after ranking and summarization.

Hugging Face daily papers and alphaXiv’s three-day feed repeat heavily. Many of the 120 candidates can already have been delivered.

**Why it matters:** The model spends tokens on items the server will remove. The digest is then written about items that disappear later, which can leave blank group summaries and missing threads.

**The fix:**

- Add a preflight endpoint that returns recently delivered item IDs and paper IDs.
- Filter those items out before ranking.
- Ideally, build the digest after the final item list is known.

**Effort:** Medium.

---

### 4.5 Collection can run out of time

**Priority:** High  
**Where:** `apps/orin-collector/collect.mjs:94-109`, `apps/orin-collector/sources.mjs`, `.github/workflows/orin-digest.yml:20`

**What happens:** Thirty feeds are fetched one after another, each with a 30-second timeout. Browser sources can add about three minutes each. Ranking adds about a minute, and summarization has a three-minute timeout. The entire workflow is capped at 15 minutes.

**Why it matters:** One slow host can consume the entire window and prevent publication. There is no overall deadline that says “stop fetching and publish what we have.”

**The fix:**

- Fetch four to six sources at a time, with per-host limits and jitter.
- Use 10–15-second source timeouts.
- Set a 10–12-minute global deadline.
- Retry once for timeouts and server errors.

**Effort:** Medium.

---

### 4.6 Every visitor downloads blog code they do not need

**Priority:** High  
**Where:** `apps/portfolio/src/App.jsx:11`, `apps/portfolio/src/pages/BlogDetailPage.jsx:4-8`

**What happens:** The blog detail page is imported eagerly, so its markdown renderer and code highlighter are included in the main bundle. Both current posts are external links, so the local markdown path is currently unreachable.

The main bundle contains about 166 kB of highlight.js and about 95 kB of markdown libraries.

**Why it matters:** Every visitor to the homepage, blog list, or any other public page downloads and parses code that is not used. This slows the first load and wastes mobile data.

**The fix:**

- Lazy-load the blog detail route.
- Split the external-link redirect from the local post body.
- Load markdown only when a local post exists.
- Configure the highlighter with a small set of languages instead of the full common set.

**Effort:** Medium.

---

### 4.7 The contact form does not send messages

**Priority:** High  
**Where:** `apps/portfolio/src/components/Contact.jsx:11-16`

**What happens:** The form calls `console.log` and shows an alert saying it is a demo. The form is live on the contact page and linked in the main navigation.

**Why it matters:** A visitor can submit a genuine inquiry, see that it was not sent, and have their name, email, and message written to the browser console. This is a direct trust and opportunity-loss issue.

**The fix:**

- Either remove the form in favor of `mailto:` or LinkedIn, or
- Wire it to a real serverless endpoint with validation, loading, success, and error states.
- Add a honeypot for spam.
- Never log message contents or personal information.

**Effort:** Small.

---

### 4.8 AI agents can receive more data than they can handle

**Priority:** High  
**Where:** `apps/orin-mcp/server.mjs:43-62`, `:76-96`, `:220-223`

**What happens:** The MCP server returns every item with its full stored excerpt. Saved mode allows up to 500 items, and search returns up to 100. There is no cursor, field selection, or size cap. Responses are serialized twice: once as pretty-printed text and once as structured content.

**Why it matters:** With 12,000-character excerpts, a 60-item digest is roughly 180,000 tokens. A large saved list can be several megabytes. Agents will hit context limits, cost more, or fail.

**The fix:**

- Default to a 20-item summary view.
- Return short snippets unless the caller explicitly asks for full content.
- Add cursor pagination.
- Enforce a hard serialized-size limit.

**Effort:** Small to medium.

---

## 5. Medium-priority problems

| Problem | Why it matters | Fix | Effort |
|---|---|---|---|
| Every authenticated request calls GitHub `/user`. An ORIN page load makes three such calls, and there is no timeout. A GitHub 5xx becomes a 401. | Adds latency, consumes rate limit, couples the site to GitHub, and falsely logs the owner out during transient outages. | Issue a short-lived signed identity session after login. Stop calling GitHub on every request. Add a five-second timeout and return 502 for GitHub server errors. | Medium |
| Saved items can return about 500 full documents. | Multi-megabyte response on mobile, high database egress, and a single misleading date for items saved across different days. | Cursor-paginate 50–100 items, return only display fields and short excerpts, and order by a dedicated `saved_at` column. | Small |
| Ingest writes about two SQL statements per item. A 100-item payload produces roughly 202 statements. | More round trips, larger transactions, and timeout risk on a serverless database. | Bulk-load items and membership in a few statements. Reject oversized bodies before parsing. | Medium |
| Important filters and joins have no indexes. | Preferences, category counts, and deletions get slower as history grows. | Add indexes on feedback, category, and digest membership, and add a retention job. | Small |
| Agent search is not ranked. It uses `%term%` matching across flexible JSON fields and orders by item ID. | The first results are effectively arbitrary, not the best or newest. Every search also scans the table. | Add full-text search, trigram indexes, relevance ranking, recency/saved boosts, and pagination. | Medium |
| There are two category systems. The collector hardcodes seven tracks, while the UI edits a separate category table. | New categories never influence diversity, and the two systems drift apart. | Make the editable taxonomy the single source of truth. Give each item one primary bucket and optional secondary tags. | Medium |
| One missing category rejects a whole ranking batch. | A single model omission can discard every score in a batch and force a fallback model. | Validate scores first. Treat missing categories as repairable in a separate low-cost pass. | Small |
| ORIN refetches the digest on every tab switch and blanks the page while loading. | Digest, Archive, Brain, and Share feel like full reloads. Repeated authenticated requests add load. | Cache by date and view; keep old content visible; add a small inline loading indicator. | Small |
| A failed category edit still looks successful. | The UI shows a label the server rejected. | Make the update function report failure and roll back the local change. | Small |
| An expired session produces a dead page instead of a login prompt. | After eight hours, every action fails silently and the sign-in gate never reappears. | Use status-aware requests; on 401/403, clear auth or show the sign-in gate. | Small |
| The 3D brain runs continuously and allocates heavily per frame. | Battery and thermal cost, dropped frames, and wasted work when scrolled out of view. | Pause with an intersection observer, throttle idle rotation to 30 fps, cache gradients, and reduce detail on small screens. | Medium |
| Canvas clicking can select a hidden node, and mobile swipes cannot scroll over the brain. | Users select something they cannot see, and the middle of the page becomes a scroll dead zone. | Reverse the hit-test order and use `touch-action: pan-y` with a horizontal drag threshold. | Small |
| The admin area downloads about 295 kB of `@babel/parser`. | Every admin page pays the cost just to read one data file. | Parse the data on the server and return JSON; load the parser only in the editor if needed. | Medium |
| Ingest accepts replayable destructive `replace` requests and arbitrary dates. | A captured request can wipe a day or rewrite historical digests. A future date becomes the default “latest” digest. | Require an idempotency key, reject far-future dates, and gate destructive replacement behind a correction secret. | Medium |
| Unknown `/api/*` routes can return HTML with a 200 status on Vercel. | Clients try to parse HTML as JSON, and monitoring cannot tell a missing API from a working one. | Add a JSON 404 rule for `/api/*` on every hosting setup. | Small |
| Collector secrets are available to dependency-install steps. | A compromised installer can read every secret, including social-session state. | Move secrets to the final publish step only. Pin third-party actions by commit SHA. | Small |
| Access rules are wider than documented, and admin writes allow a missing `Origin`. | Undocumented allowlists can give other users owner-level access. The admin write path has weaker CSRF protection than ORIN. | Enforce owner-only writes or explicit roles. Require `Origin` or `Sec-Fetch-Site` plus a CSRF token. Compare GitHub user IDs, not mutable logins. | Small to medium |
| OAuth has no PKCE, and the server has no content security policy or frame protection. | Weaker defense against code interception, clickjacking, and script injection. | Add PKCE, CSP, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`, and HSTS. | Small |
| Run outcomes are stored, but causes are not. | Token usage, actual cost, source latency, retries, and suppress counts are invisible. Cost tuning is guesswork. | Add an `orin_runs` table with timings, attempts, usage, cost, counts, and error classes. Keep a daily spend ledger. | Small to medium |
| Ranking evaluation cannot tell top results apart. All three models scored a perfect nDCG@15 because every top-15 item was grade 3. | The benchmark cannot show whether one model’s top five is better than another’s. | Use user-reviewed graded labels, category-specific precision, and a golden end-to-end fixture with failure injection. | Medium |
| There are no browser tests for ORIN auth, tab switching, or the canvas. | The riskiest UI paths are only tested by hand. | Add React Testing Library or Playwright smoke tests. Add a lint script. | Medium |

---

## 6. Smaller cleanup items

These are worth fixing, but they are not urgent:

- Add a catch-all 404 page and a static 404 file. Unknown URLs currently render a blank page.
- Add per-page titles, descriptions, canonical URLs, social preview images, `robots.txt`, and a sitemap.
- Give each page a single `h1`.
- Implement the ARIA tabs pattern for ORIN, or use ordinary buttons with `aria-pressed`.
- Normalize `VITE_ORIN_ORIGIN` with `new URL()` to avoid a redirect loop when the value has a trailing slash.
- Resize blog images, add `width` and `height`, and lazy-load them.
- Remove or replace the local-only blog comments. They currently vanish on reload.
- Add a TTL and size limit to the MCP HTTP session map.
- Require a read-only database role for MCP instead of falling back to the read-write URL.
- Make `/api/health` check the database, not just whether the process is alive.
- Fix the partial-citation case where a group summary can still refer to a filtered fabricated URL.
- Add a unique index on category labels to avoid select-then-insert races.
- Upgrade the vulnerable router dependency and remove unused packages.
- Correct the documentation that says only the repository owner has access and that the token expires after eight hours.

---

## 7. Quick wins

These are small changes with a good return. Time estimates are rough for one engineer.

| Change | Why it is worth doing | Time |
|---|---|---|
| Lazy-load the blog detail page and load markdown only for local posts | Removes roughly 75–90 kB compressed from every public first load | Half a day |
| Remove the contact form or connect it to a real endpoint | Stops losing real inquiries and stops logging personal information | One to two hours |
| Add a digest publish guard and summary fallback | Prevents a thin or failed run from erasing a good day | One to two days |
| Cache the GitHub identity and show the login gate on 401 | Removes three external calls per ORIN load and fixes dead sessions | One day |
| Cache ORIN data by date and view; roll back failed category edits | Makes tab switching instant and stops false success states | One day |
| Add the missing indexes and stop rewriting item data for read/saved changes | Immediate database cost and speed win | Half a day |
| Move collector secrets to the publish step only | Removes a broad credential-exposure surface | Fifteen minutes |
| Add a JSON 404 for unknown API routes | Makes failures visible and predictable | One hour |
| Add security headers and upgrade the router | Closes basic browser-level gaps | Half a day |
| Fix canvas hit order, mobile scrolling, and offscreen rendering | Removes a visible interaction bug and wasted battery | Half a day |

---

## 8. ORIN product plan

### 8.1 What ORIN is today

ORIN currently gives the owner:

- a daily digest of papers, posts, and discussions;
- seven hardcoded interest tracks;
- one editable category per item;
- a keyword filter over the current digest;
- a live 3D brain view;
- read, save, and thumbs-up/down feedback;
- an MCP connection that lets AI agents search the database.

It is a beautiful reading room. It is not yet a research system.

There is no durable corpus across days, no meaning-based search, no structured claims, no model of the user’s goals, no gap analysis, and no way to ask, “Given what I want to build, what should I do next?”

### 8.2 What ORIN should become

**Positioning:** ORIN is the idea-to-evidence desk for AI systems work.

**The job it should own:**

> Given what I want to build and the constraints I have, what does the evidence say, what is missing, and what should I do next?

This is different from a news reader, which competes with arXiv, Hacker News, and newsletters. It is also different from a generic chatbot, which competes with ChatGPT.

The unique advantage is the combination of:

- a curated source pool;
- durable knowledge extraction;
- explicit coverage gaps;
- recommendations tied to the user’s hardware, stack, and goals;
- citations the user can inspect.

The daily digest remains the habit surface. The Workbench becomes the reason to stay.

### 8.3 The 11 buckets

Replace the seven hardcoded tracks with 11 durable buckets. Each item gets one **primary bucket** and up to three **secondary tags**. It should not be forced into a single label.

| Bucket | What belongs there and what it helps decide |
|---|---|
| **Model Innovation** | Architectures, reasoning, multimodal models, reinforcement learning, post-training, modelling recipes. Example: “Replicate this reasoning-RL recipe at 7B and compare it with DPO.” |
| **Training & Scaling** | Data mixtures, scaling laws, distributed training, fine-tuning, training efficiency. Example: “Reproduce this 1B recipe on 8×MI300X and measure MFU and tokens per dollar.” |
| **Inference Engineering** | Serving, KV cache, batching, speculative decoding, quantization, routing. Example: “Add prefix caching and benchmark TTFT at 8k and 32k context.” |
| **GPU & Kernel Engineering** | CUDA, Triton, ROCm, attention and GEMM kernels, compilers, profiling. Example: “Build a fused ROCm attention path and compare it with the Triton baseline.” |
| **Hardware & Systems** | Accelerators, memory, interconnects, clusters, power, cost. Example: “Compare MI300X and H100 for 70B at 32k and report cost per million tokens.” |
| **Agents & Tooling** | Planning, memory, tool use, protocols, coding agents, orchestration. Example: “Build a repo-level coding agent and evaluate patch acceptance.” |
| **Evaluation & Reliability** | Benchmarks, evals, red teaming, observability, failure analysis. Example: “Create a tool-use hallucination eval and calibrate abstention.” |
| **Safety, Security & Policy** | Alignment, interpretability, prompt injection, model security, governance. Example: “Threat-model RAG ingestion and agent tool access.” |
| **Data, Retrieval & Knowledge** | Datasets, embeddings, retrieval-augmented generation, knowledge graphs, retrieval evaluation. Example: “Test hybrid retrieval plus reranking on a domain corpus.” |
| **Developer Tools & Coding** | IDEs, code generation, review, test generation, developer workflow. Example: “Benchmark codegen and test generation on the internal repository.” |
| **Industry & Research Practice** | Lab releases, compute economics, reproducibility, research trends. Example: “Track lab release velocity and compute constraints in a weekly brief.” |

This covers the requested areas. Compilers sit under GPU & Kernel Engineering. Reinforcement learning sits under Model Innovation and Training & Scaling. Keeping them as sub-buckets avoids a taxonomy that is too large to use.

### 8.4 A bucket should be a living workspace

Each bucket should show:

- how many sources it contains;
- what share are primary sources;
- how fresh the evidence is;
- how reproducible the work is;
- the most important entities, such as models, methods, benchmarks, and hardware;
- “what changed this week”;
- the best five sources to read first;
- open questions and current gaps;
- recommended actions;
- the source mix, so the user can see whether one publication or community is dominating.

A bucket is not a filtered list. It is a maintained dossier.

### 8.5 Understanding the knowledge

Summaries alone are not comprehension. ORIN needs an evidence layer:

**Evidence cards.** Each source gets a normalized card with title, authors, venue, date, source type, code and benchmark links, key claims, methods, results, limitations, reproducibility score, buckets, and entities.

**Structured claims.** Turn prose into facts such as:

> Method “paged attention” improves “throughput” by “2.1x” under conditions “70B model, MI300X, batch 8, 32k context.”

The exact shape can vary, but the point is to store the method, metric, value, conditions, source passage, and confidence. Structured claims enable comparison, contradiction detection, and gap analysis.

**Entity graph.** Link models, methods, benchmarks, datasets, hardware, organizations, and software versions. This is how ORIN knows that two papers are about the same technique, or that one result applies to a different GPU.

**Living dossiers.** Generate a weekly “state of the bucket” brief from the claims and sources. Include what changed, where sources agree, where they disagree, what is still unknown, the best evidence, and whether anyone has published code.

**Deduplication.** The same paper or story syndicated through arXiv, Hacker News, Substack, and X should become one canonical evidence card with provenance, not four digest slots.

**Quality and coverage scoring.** Track primary-source ratio, recency, code availability, benchmark rigor, reproducibility, and source diversity. Do not treat popularity as quality.

The key rule: **extract structured facts first, then generate summaries from those facts.** Do not summarize every document independently and hope the summaries add up to knowledge.

### 8.6 Gap analysis that produces actions

A gap engine needs a goal, not just a search query. The user supplies a **goal profile**:

- use case;
- hardware;
- model size;
- latency or throughput target;
- software stack;
- timeline;
- constraints.

ORIN then computes a coverage matrix across buckets and sub-buckets:

- how much evidence exists;
- how much is primary;
- how recent it is;
- how diverse the sources are;
- whether the work is reproducible;
- whether it matches the user’s hardware and stack;
- whether credible sources disagree;
- whether there is implementation evidence or only commentary.

**Gap types:**

| Gap type | What it means | Recommended action |
|---|---|---|
| Knowledge gap | No source covers this intersection | Research or collect more sources |
| Evidence gap | Only commentary exists, no primary result | Find a paper, benchmark, or code |
| Replication gap | No code or reproducible benchmark | Build or replicate |
| Portability gap | Evidence exists for NVIDIA but not AMD | Benchmark on the target hardware |
| Scale gap | Only small-model or short-context results exist | Run at the target scale |
| Recency gap | The evidence is stale | Refresh sources or rerun the analysis |
| Contradiction gap | Credible sources disagree | Design an experiment that distinguishes them |

Each gap becomes a **recommendation card**:

> Action | Why now | Evidence | What is missing | First experiment | Success metric | Effort | Confidence

Prioritize by impact, tractability, and cost. Show at most three actions at once.

**Example: AMD inference gap brief**

Goal: serve a 70B model at 32k context on 8×MI300X with sub-2-second time to first token.

- **What is known:** MI300X has 192 GB of HBM3. ROCm is roughly 90–95% of H100 for standard inference. vLLM and SGLang provide paged attention and continuous batching.
- **What is contested:** real 32k-context time to first token and throughput on MI300X, and the quality of ROCm attention kernels at long context.
- **What is missing:** a public MI300X 32k benchmark in the current source set; a direct ROCm equivalent of FlashAttention-3; and confirmation of whether MXFP4 applies to MI300X, because current sources indicate it is limited to MI350/MI355.
- **Build:** add prefix caching and a ROCm-friendly attention path, then benchmark batch sizes 1, 8, and 32 at 8k and 32k context.
- **Research:** characterize MXFP4 fallback and kernel coverage on MI300X.
- **Success metric:** reproducible time to first token, time per output token, tokens per second, and tokens per dollar versus H100. Kill the path if time to first token misses the target at the required batch size.

This is the style of recommendation ORIN should produce: specific, cited, constrained, and testable.

### 8.7 The idea-to-evidence chatbot

The chatbot should be a workbench, not a chat bubble.

**Step 1: Idea intake.** The user writes an idea or question. Optional chips capture hardware, model size, latency target, stack, and timeline.

**Step 2: Query planning.** ORIN extracts the intent, entities, methods, tasks, hardware, constraints, recency needs, and preferred evidence types. It expands acronyms and aliases from the taxonomy.

**Step 3: Candidate generation.** Apply hard filters first, then search in two ways:

- keyword/full-text search for exact names and terms;
- meaning-based vector search for related ideas that use different words.

Take the top 100 candidates.

**Step 4: Fusion and reranking.** Combine the two ranked lists, rerank the top 30 with a stronger relevance model, remove duplicates, and apply a diversity filter so one source or one narrow view does not dominate.

**Step 5: Coverage check.** Measure how much evidence exists by bucket and entity. If coverage is thin, say so instead of writing a confident answer.

**Step 6: Grounded answer.** Return a structured brief, not free-form prose:

- the restated idea and assumptions;
- what the evidence says, with citations;
- where sources disagree;
- what is missing, as gap cards;
- recommended next actions, with a first experiment and success metric;
- ranked sources with a short “why this matched” note and a highlighted snippet.

**Step 7: Follow-up and action.** Keep the evidence set across follow-up questions. Let the user save the brief, create a gap, turn it into an experiment plan, or send an evidence request to the collector.

**Ranking signals:** semantic relevance, exact-term match, entity match, bucket match, hardware and stack match, recency, source authority, reproducibility, saved/feedback history, and diversity.

Start with a simple weighted combination. Learn the weights from user feedback later. Do not rank by item ID or recency alone.

**Trust rules:**

- Every factual claim must map to a retrieved source passage.
- If no supporting passage exists, say “insufficient evidence.”
- Treat all source text as untrusted. Never let retrieved content invoke tools or change instructions.
- Distinguish “the source claims” from “ORIN’s inference.”
- Show confidence and coverage, not just an answer.

### 8.8 A concrete example

**User idea:**

> I want to serve a 70B model at 32k context on 8×MI300X with sub-2-second time to first token. What should I build?

**ORIN response:**

- **Evidence map:** 18 sources across Inference Engineering, GPU & Kernel Engineering, and Hardware & Systems. Six are primary sources. Two are benchmark reports.
- **What is known:** paged attention and continuous batching are well covered. MI300X capacity is strong. ROCm performance is close for standard inference.
- **What is contested:** long-context time to first token, kernel maturity, and quantization support.
- **What is missing:** no public 32k MI300X benchmark in the source set; a ROCm attention-kernel gap; MXFP4 may not apply to MI300X.
- **Next actions:** benchmark vLLM on ROCm at 8k and 32k; build prefix caching; research the MXFP4 fallback; compare cost per million tokens with H100.
- **Sources:** ranked evidence cards with snippets and links.

### 8.9 Workbench layout

Add a top-level **Workbench** alongside Digest, Explore, Gaps, and Ask.

- **Explore:** buckets, dossiers, evidence cards, source coverage.
- **Gaps:** gap radar, coverage matrix, saved recommendations, and status tracking for “researched,” “built,” or “dismissed.”
- **Ask:** idea input, evidence brief, source rail, coverage map, save and export.
- **Workbench:** active ideas, saved briefs, experiment plans, and outcomes.
- **Digest:** the daily habit surface, linked into the knowledge layer.
- **Brain:** keep it as a delightful exploration view, not the primary workflow.

A useful layout is a three-pane evidence desk: idea and constraints on the left, answer and gaps in the center, ranked sources and snippets on the right. This keeps provenance visible instead of hiding it inside a chat transcript.

---

## 9. Technical plan without the jargon

### 9.1 Data

Use Neon Postgres with the pgvector extension. This keeps the source data, search index, and embeddings in one place. Do not add a separate vector database at this scale.

The core tables should be:

- **Documents:** one row per canonical source, with URL, title, authors, date, content hash, duplicate cluster, quality score, and metadata.
- **Chunks:** smaller passages from each document, with a text search index and an embedding.
- **Topics and document topics:** the bucket hierarchy, plus a multi-label link between documents and buckets.
- **Entities and document entities:** models, methods, benchmarks, hardware, datasets, and organizations.
- **Claims:** structured facts extracted from sources, with conditions, source passage, and confidence.
- **Claim relations:** supports, contradicts, or extends another claim.
- **Briefs:** saved answers with their goal, query, evidence, and gaps.
- **Gaps and actions:** the gap type, priority, status, evidence, and experiment plan.
- **Runs, feedback, and events:** observability, ranking feedback, and outcomes.

Add indexes for vector search, full-text search, title matching, dates, and foreign keys. Add a retention policy so old digests and orphan items do not grow forever.

### 9.2 Search

Search should combine two approaches:

1. **Keyword search** for exact names, error messages, model versions, and acronyms.
2. **Meaning-based search** for related ideas that use different words.

Run both, merge the ranked lists, rerank the best candidates, and remove near-duplicates. Apply filters for date, source type, bucket, hardware, and evidence quality. Return short snippets by default.

This is the difference between “find the word ROCm” and “find evidence about running long-context inference on AMD GPUs.”

### 9.3 Collection pipeline

The pipeline should be:

> Fetch → clean and deduplicate → enrich → classify into buckets → extract claims and entities → chunk and embed → index → generate dossiers and gaps

Batch the embedding work. Cache classification by content hash, prompt version, and model. Store snippets and links rather than full copyrighted articles.

### 9.4 APIs and agent access

The main endpoints should be:

- `POST /api/orin/search` for filtered, paginated search.
- `POST /api/orin/ask` for a streamed evidence brief.
- `GET /api/orin/evidence/:id` for a full evidence card and source passages.
- `POST /api/orin/briefs` to save a brief.
- `GET /api/orin/gaps` for ranked gap cards.

Expose a small set of read-only MCP tools:

- `orin_search`
- `orin_get_evidence`
- `orin_get_brief`
- `orin_find_gaps`

Make them summary-first, paginated, and backed by a read-only database role.

### 9.5 Evaluation

Build a golden set of 50–100 ideas with the evidence a human would expect. Measure:

- ranking quality at the top of the list;
- how many relevant sources are found;
- citation precision;
- unsupported-claim rate;
- whether gap recommendations are actionable;
- response time and cost.

Run this set on every retrieval or prompt change. Without it, the chatbot will feel better while getting less reliable.

---

## 10. Roadmap

| Phase | Scope | What “done” looks like |
|---|---|---|
| **0 · Trust and speed** (1–2 weeks) | High-priority security and publish fixes, auth session cache, lazy blog route, contact form, database indexes, security headers, JSON 404 | No high-priority issues remain; ingest success above 99%; entry bundle under about 250 kB compressed |
| **1 · Corpus and search** (3–5 weeks) | 11-bucket taxonomy, document and chunk schema, embeddings, hybrid search, evidence cards, Ask v0, MCP search v2 | Search works across all history; retrieval baseline is measured; p95 search under 1.5 seconds |
| **2 · Understanding and gaps** (4–6 weeks) | Claim and entity extraction, living dossiers, coverage matrix, gap cards, experiment planner, AMD example | 10 goal briefs with citations; at least 3 actionable gaps per week; citation precision above 95% |
| **3 · Workbench and feedback** (4–6 weeks) | Idea workspace, saved briefs, action tracking, feedback loop, evaluation dashboard, source operations | 25% of briefs lead to an experiment; measurable four-week retention |
| **4 · Scale** (ongoing) | Collaboration, alerts, public briefs, team workspaces, more connectors | Only after the single-user workflow is trusted |

These estimates assume one strong full-stack engineer. Adjust for the actual team.

---

## 11. How we will know it is working

| Area | Measure | Why it matters |
|---|---|---|
| **Trust** | Ingest success rate, zero digest regressions, entry bundle size, p95 page load | The product must be reliable before it can be a daily habit |
| **Retrieval** | nDCG@10, recall@20, citation precision, unsupported-claim rate, p95 ask latency, cost per query | The answer is only useful if the right evidence is found and cited |
| **Product** | Time from idea to evidence brief, briefs per week, brief-to-experiment conversion, gaps closed, four-week retention | These show whether ORIN is becoming a work tool, not just a reader |
| **Corpus** | Bucket coverage, primary-source ratio, reproducibility rate, source diversity | These show whether the knowledge base is broad and trustworthy |

In plain terms:

- Does the right evidence show up?
- Does every claim have a source?
- Does the user get a next action they can actually run?
- Do they come back and do it again?

---

## 12. Risks and non-goals

- **Do not build a generic chatbot.** The value is evidence, gaps, and actions under constraints.
- **Do not let the model invent recommendations from thin evidence.** Citation-gate the answer and make “insufficient evidence” a first-class result.
- **Do not overinvest in the 3D brain.** It is distinctive and worth keeping, but it is not the research workflow.
- **Do not add a separate vector database yet.** Postgres plus pgvector is enough and keeps provenance in one place.
- **Do not let the taxonomy sprawl.** Start with five active buckets even if 11 are defined. Promote sub-buckets only when source volume justifies it.
- **Watch source licensing and prompt injection.** Store snippets and links, treat all retrieved text as untrusted, and never give the model write-capable tools.

---

## 13. Recommended next step

The highest-leverage next step is a focused **Phase 0 patch set**:

1. Replace the browser GitHub token with a server-side session and revoke it on logout.
2. Add the digest publish guard and summary fallback.
3. Add a preflight endpoint so already-delivered items are filtered before ranking.
4. Lazy-load the blog and remove or connect the contact form.
5. Fix ORIN tab caching, expired-session handling, and failed category edits.
6. Add the missing database indexes and bulk ingest.
7. Add security headers, scope collector secrets to the publish step, and return JSON 404 for unknown API routes.

That set removes the highest-risk issues without committing to the full product build. The product work can then start on a stable base.

No repository files were changed during this review.
