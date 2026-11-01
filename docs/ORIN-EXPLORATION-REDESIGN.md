# ORIN exploration redesign

Implemented November 1, 2026. This complements the earlier navigation plan; these release phases refer to the composer and Investigations redesign.

## Release 1 — Ask layout

- Composer immediately follows a single headline; three compact prompts populate an editable question.
- History is collapsible. Capture uses a secondary rail button.
- Model and reasoning settings remain available in the compact model control.

## Release 2 — Search and source selection

- The composer switches between Ask, Search, and Research while preserving the question and selected sources.
- Search uses `/api/orin/search`, displays up to 100 saved source items, and falls back to keyword results. It does not generate an answer. Notes remain available to whole-library Ask retrieval.
- Up to 10 source items can be attached, removed, or cleared. Selection is temporary and clears at sign-out or page reload.
- Scoped Ask sends only item IDs to the API. The server validates the scope and reloads current, non-deleted saved text. Missing or textless selections fail visibly instead of falling back to unrelated library evidence.
- Selected excerpts share the answer context allowance so every selected item can be represented. These are bounded saved excerpts, not full-document reads.

## Release 3 — Research and Investigations

- Research mode and “Research this further” create editable investigation drafts without submitting paid work.
- Questions and HTTPS starting references transfer together. References without a valid HTTPS link are reported as omitted. Long questions remain intact for editing and must meet the existing 1,500-character research limit before review.
- The existing `?tab=research` URL is preserved; the destination is labeled Investigations.
- Activity leads with running work and completed briefs. Drafts, Explore suggestions, and Profile have separate views. Completed briefs show a findings preview, with outcome editing collapsed.
- Review displays scope, depth, and total maximum budget. A second explicit confirmation starts the batch. Changes to the plan invalidate the review. Existing request IDs continue to protect retries against duplicate paid batches.
- Research still requires the configured providers and independent worker. Ask model choice does not change the research worker's configured model.

## Validation

- Portfolio tests cover scope validation, storage reloads, fail-closed selection, context limits, API forwarding, and research handoff normalization.
- Full repository tests and production build run before delivery.
- Local browser fixtures exercise search → selection → cited answer → research draft → review → confirmation, including changed-budget re-review and empty search.
- Visual checks cover desktop and mobile, light and dark themes. Fixture submissions do not contact providers or write production data.

No deployment or schema migration is required specifically for this UI redesign. The existing Ask model/history work in the earlier checkpoint retains its documented migration requirements. Frontend and API changes should be deployed together for selected-source answers.
