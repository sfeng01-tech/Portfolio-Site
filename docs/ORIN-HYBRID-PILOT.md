# ORIN hybrid search pilot

This is an isolated retrieval experiment, not the search used by ORIN's UI,
MCP server, recommender, or research worker. It compares ORIN's current
full-text query, cosine similarity, and reciprocal rank fusion (RRF, k=60)
on the same bounded snapshot. The expanded pilot takes up to 200 most recently updated, non-deleted arXiv
items and up to 80 public ROCm documentation and blog pages from the official
AMD domains, all with excerpts. It saves a title and up to 3,000 characters of
excerpt alongside each vector. It does not index notes, chats, research
reports, other shared links, other feeds, or full article text.

It sends those public arXiv and ROCm titles and excerpts and the evaluation
queries to OpenRouter and its selected embedding provider using
`openai/text-embedding-3-small` (1,536 dimensions). This model is separate
from DeepSeek used for research. The backfill and evaluation make paid API
requests, capped by 280 documents, 20 inputs per batch, and 3,500 characters
per input. Repeated backfills skip unchanged items; the table remains capped at
280. No API key, excerpts, or vectors are printed; evaluation does print the
queries and returned titles. Embeddings are not anonymized
and should be treated as potentially sensitive. No ANN index is needed for
this small corpus; pgvector performs exact cosine search.

## Run on an isolated Neon branch

Create a Neon child branch of the ORIN production database with a direct
compute endpoint. The pilot uses `ORIN_DATABASE_URL` only for credentials and
database name, substitutes the direct endpoint provided via `ORIN_PILOT_HOST`,
and refuses to use the same endpoint as `ORIN_DATABASE_URL`. Ensure the
branch is an isolated test branch; hostname comparison alone is not a complete
production safety check. It does not modify `.env.local`. Use a branch with
an expiration and avoid sending private content to the provider.

From the repo root, with `ORIN_DATABASE_URL` in `.env.local` and either
`OPENROUTER_API_KEY` in the environment or the existing macOS Keychain entry:

```sh
export ORIN_PILOT_HOST='<direct-pilot-branch-hostname>'
node --env-file=.env.local apps/orin-collector/hybrid-pilot/pilot.mjs init
node --env-file=.env.local apps/orin-collector/hybrid-pilot/pilot.mjs backfill --keychain-openrouter
node --env-file=.env.local apps/orin-collector/hybrid-pilot/pilot.mjs eval --keychain-openrouter
node --env-file=.env.local apps/orin-collector/hybrid-pilot/evaluate-v2.mjs --keychain-openrouter
```

On non-macOS systems, provide `OPENROUTER_API_KEY` and omit the Keychain flag.
`init` applies the additive [pilot schema](../apps/orin-collector/hybrid-pilot/schema.sql)
to the test branch. The evaluation prints five titles per strategy and a JSON
summary; redirect output to a private file if desired. IDs in
[evaluation.json](../apps/orin-collector/hybrid-pilot/evaluation.json) identify
known public arXiv records in the snapshot. A missing or ambiguous label stops
the evaluation. Rebuild the labeled set when using a different corpus rather
than silently reporting metrics on missing labels.

## Initial result, 2026-11-01

On a snapshot of 200 arXiv entries and eight manually selected question–paper
pairs, hit rate at five was keyword 6/8, semantic 7/8, and RRF hybrid 6/8.
Mean reciprocal rank at five was 0.7500, 0.8125, and 0.7500, respectively.
The score asks only whether the one known labeled paper appears; other results
are unjudged, not necessarily irrelevant. The labels were selected from the
same snapshot and are not a blind or comprehensive test. These numbers do not
show that hybrid search improves ORIN overall, nor do they measure gaps or
novelty. In particular, retain exact-term retrieval for versions and names.

Before integrating: build a larger, independently judged query set with
multiple relevance labels and hard negatives; include AMD/ROCm versions,
research perspectives, safety, agent harnesses, kernels, training and serving;
compare recall, rank, latency and embedding cost. Test other sources and
private-content boundaries deliberately. Decide whether fusion or reranking is
better only after that evaluation. Migration, ongoing indexing, deletion and
edits, model/version changes, authorization, and graceful keyword-only
fallback still need a production design.

The initial experiment used an isolated, expiring Neon branch; no production
schema, UI, MCP or research integration was changed.

## Expanded evaluation, 2026-11-01

The same isolated branch was expanded to 227 items (200 arXiv and 27
official AMD ROCm pages). Twenty queries and their positive and explicit
negative judgments were created from titles and excerpts before running the
new rankings. The evaluator, who also built the experiment, had seen the
earlier eight-query results; these are not independent or blinded judgments.
The queries include ROCm version and GPU names, AMD inference, kernels,
training, agents, harnesses, safety, quantization, RL, and infrastructure.
The labels are incomplete and any result without an explicit judgment remains
unjudged; it is not counted as irrelevant.

| Strategy | Hit@5 | Macro recall@5 | MRR@5 | Labeled negatives in top five |
| --- | ---: | ---: | ---: | ---: |
| Keyword | 19/20 | 0.833 | 0.793 | 1 |
| Semantic | 19/20 | 0.842 | 0.810 | 1 |
| Equal-weight RRF | 20/20 | 0.875 | 0.879 | 1 |
| RRF, 2x semantic weight | 20/20 | 0.833 | 0.879 | 0 |

Across the 100 top-five slots per method, 68–71 results had no judgment.
The three exact AMD/version queries each found their labeled source at rank
one in all four strategies, but one labeled negative also appeared in the
top five for all except semantic-weighted RRF. These tests do not establish
that an absent version can be identified reliably, and ranking is not a hard
filter. Semantic-weighted RRF is an exploratory comparison on the same data,
not an independently validated improvement.

One run reported 193 query embedding input tokens and $0.00000386 provider
cost across 20 embeddings; initial and incremental document embedding costs
were not recorded. Measured query embedding median/p95 were 412/634 ms, and
the combined SQL comparison median/p95 were 85/249 ms, including network and
all retrieval strategies. These are single-run pilot measurements, not a
production latency benchmark.

The aggregate results by topic are saved in the [evaluation artifact](../apps/orin-collector/hybrid-pilot/results/2026-11-01-expanded.json).

Equal-weight fusion is a reasonable candidate for a larger evaluation, but
not yet an automatic recommendation policy. Build a held-out query set with
independent human judgments and broader source coverage; test missing and
conflicting versions explicitly, along with metadata filters, deletions,
permissions, stale embeddings and keyword-only fallback. Assess retrieval
quality separately from claims that a contribution is novel or AMD-compatible.

## Research worker integration

The research worker now supports an opt-in retriever. With
`ORIN_RESEARCH_HYBRID_ENABLED=true` and a populated `orin_research_embeddings`
table, it searches the full non-deleted library by keyword and the indexed,
unchanged subset by semantic similarity, then combines their rankings with
equal-weight RRF. Unindexed and changed items remain eligible for keyword
search. A stored vector is ignored if its title or excerpt has changed since
indexing. Deleted items are excluded in both retrieval paths.

For each generated library-search query, explicit AMD MI GPU identifiers and
versions attached to ROCm, vLLM, PyTorch or CUDA are hard filters on both
retrieval paths. The pilot distinguishes `ROCm 7.10 preview` from `ROCm 7.10`,
and `MI300` from `MI300X`. Other naming forms and products are not yet
recognized; a generated research query can omit identifiers present in the
owner's original question. These are text matching constraints, not proof of
compatibility, and strict filtering may omit general background sources. No
results is reported honestly when no indexed/library excerpt matches all
recognized constraints. Web searches are unchanged.

The worker sends each generated search query (which may contain sensitive
research details) to OpenRouter and the selected embedding provider. It
reserves $0.01 from the job's existing budget before each paid embedding call
and limits provider prompt price to $1 per million tokens. The reservation is a
conservative budget allowance, not the actual cost. If the model, database
index, credentials, or allowance are unavailable, retrieval falls back to the
same constrained keyword search. A cancelled job still stops. Search history
records the method, recognized constraints and safe fallback reason.

The additive research-vector schema is
[research-embeddings.sql](../apps/orin-collector/research-embeddings.sql).
On a **test branch only**, apply it with a direct connection and run:

```sh
ORIN_PILOT_HOST='<direct-pilot-branch-hostname>' node --env-file=.env.local apps/orin-collector/hybrid-pilot/sync-research-index.mjs
```

This copies existing vectors only when their source titles and excerpts still
match the pilot snapshot; it does not generate embeddings or contact a model
provider. The 227-item development index is a bounded test fixture, not a
production index. To try a worker with the feature enabled, run it against a
separate test branch and database credentials, and set
`ORIN_RESEARCH_HYBRID_ENABLED=true` only in that worker's environment. The
GitHub workflow passes the matching repository variable if set; it defaults to
false. The vector schema must be migrated before enabling hybrid retrieval.

Production indexing runs through `.github/workflows/orin-research-index.yml`
once daily at 14:37 UTC when the hybrid flag is true, and can also be manually
dispatched. Each run processes at most 200 new or changed items, with a $0.80
conservative per-run input-token allowance and a $1/million-token provider
price ceiling. It indexes only arXiv entries with an arxiv.org URL and RSS
entries from official ROCm docs/blog URLs; it excludes user-edited titles,
private shares, notes and conversations. It removes derived vectors after soft
deletion or when a source no longer qualifies, and reindexes changed text or
model IDs. The indexer validates the source again when writing to guard
against concurrent edits. Hard-deleted items cascade to their vectors. Search
also excludes ineligible, deleted and stale items between indexer runs.

Embedding is separately billable. Query embeddings reserve $0.01 per query from
the research job budget; a daily indexer run has its own separate allowance,
not charged to an individual research job. These are conservative bounds, not
actual charges. The index is deliberately partial: material outside the
allowlist remains keyword-searchable but has no semantic coverage. Revisit
source permissions and perform held-out evaluation before expanding its scope.
