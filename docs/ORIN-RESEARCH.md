# ORIN research workbench

The private Research tab adds an editable research profile, explainable suggestions, a manual queue, batch instructions, and contribution briefs. Suggestions are inexpensive keyword signals from up to 200 recently updated and 100 saved historical items, not claims that a research gap exists. The profile and explicit outcome feedback affect suggestions; this is not an automatically trained recommendation model. The existing reading ranker is unchanged.

Select reading items using **Add to research**, then open Research and combine selected sources into a question. You can also add a question or URLs directly, edit each question's instructions, set batch-wide instructions, choose library-only or library plus web, and set a total budget. The cap is split equally among up to ten questions. Drafts remain in memory when changing ORIN tabs and are discarded when leaving ORIN or signing out. Submitted jobs and outcomes persist in Postgres.

## Research process and limits

An independent worker claims each job, resolves selected saved items, optionally extracts selected URLs using Tavily, asks the configured OpenRouter model for up to three prior-art and counterevidence queries, searches the ORIN archive and optionally the web, and produces a structured brief. For models that support these levels, it uses low reasoning effort for planning and high effort for synthesis; reasoning tokens count toward the reserved output budget. A job records progress, bounded source excerpts, search terms, and a conservative cost reservation before paid requests. Sources, search results, and article text are treated as untrusted input. The report links to evidence, distinguishes source claims from interpretation, and labels candidates provisional. Citation IDs are checked, but citation entailment, exhaustive prior-art coverage, hardware support, and novelty are **not automatically verified**. Source text is truncated; an extracted page is not necessarily a full paper. A library-only run cannot confirm a research gap.

Web mode sends selected URLs and generated search queries to Tavily. Research questions, prompts, profile details, and retrieved excerpts are sent to the configured OpenRouter model provider. Use library-only mode to avoid web retrieval, but it still uses the external model. Only submit material you want those providers to receive. ORIN's MCP server remains read-only and is not used to execute or store jobs.

Cancellation prevents future steps and retains the last checkpoint; a provider request already in flight can still complete and incur cost. Leases prevent stale workers from overwriting cancelled jobs and allow a crashed job to be reclaimed once; a second interruption marks it failed with its last checkpoint. Cost reservations survive retries. Reservations are conservative estimates based on the model catalog and configured search allowance, not billing reconciliation. Provider pricing and ancillary charges can change; review billing and keep the search allowance current.

## Configuration and migration

1. Test the additive research tables in `apps/portfolio/server/orin-schema.sql` on an isolated database branch using a direct connection. Apply the migration to the ORIN database before deploying the new API. Do not apply it to production merely to preview the interface.
2. Configure `OPENROUTER_API_KEY` in **both** the private ORIN Node web service and the worker. Research defaults to `deepseek/deepseek-v4.1-flash-1017` through OpenRouter. Optionally set `ORIN_RESEARCH_MODEL` on the web service to select another OpenRouter model that accepts JSON-object output and whose catalog includes pricing and context size; each submitted job snapshots that choice. The worker uses that model for the job, regardless of its own default. The web service checks configuration before accepting jobs; it does not verify that the worker is actually running.
3. For optional web research, configure `TAVILY_API_KEY` in both the web service and worker. `ORIN_RESEARCH_SEARCH_USD` sets the conservative allowance for one basic search or five basic extractions (default `0.02`, minimum `0.01`); set this at or above the actual cost under your Tavily plan. Selected links and excerpts may be sent to Tavily. Do not expose these keys to the browser.
4. Give the worker `ORIN_DATABASE_URL` with the required access to research jobs and read access to ORIN items. Run it separately from the HTTP service:

   ```sh
   npm run research:worker --workspace=@portfolio/orin-collector
   ```

   It polls until stopped. Add `-- --once` to process at most one job, useful for a scheduler. A worker restart does not erase jobs. Use the same database as the private ORIN service.

An optional GitHub Actions workflow, `.github/workflows/orin-research.yml`, processes at most one question per run, every 15 minutes when repository variable `ORIN_RESEARCH_ENABLED` is `true`, or on manual dispatch. Configure repository secrets `ORIN_DATABASE_URL`, `OPENROUTER_API_KEY`, and optionally `TAVILY_API_KEY`, plus optional repository variables `ORIN_RESEARCH_MODEL` and `ORIN_RESEARCH_SEARCH_USD`. The scheduled worker can take longer than 15 minutes to pick up a job, and a ten-question batch takes multiple runs. It uploads no research artifacts. The workflow is disabled by default and is independent of the daily collector.

These changes only prepare the repository. They do not apply the migration, configure provider credentials, start a worker, enable the scheduled workflow, or deploy the application.
