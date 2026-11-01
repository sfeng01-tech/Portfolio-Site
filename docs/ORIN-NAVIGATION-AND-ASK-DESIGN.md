# ORIN navigation + Perplexity-style Ask

**The short answer:** replace the flat tab row with a grouped, collapsible rail on desktop and a bottom bar plus “More” sheet on mobile. Make **Ask ORIN** a first-class destination that answers from the saved library with inline citations, source cards, and conversation history. Ship it in phases: navigation and library-grounded answers first, web/mixed modes next, then deeper connections to Research, Projects, and Notes.

This document is the design recommendation and phase plan, not a Phase 1-only report.

---

## 1. Why the current navigation stops working

The 11-tab row was fine while ORIN was a digest with a few extras. It is now several products sharing one page:

- Daily digest
- Archive
- Reading list
- Reference Projects
- Books
- Videos
- Research
- Notes
- Reminders
- Live brain
- Share

Putting all of them at the same visual weight creates four problems:

1. **No hierarchy.** A daily habit, a long-running research workspace, and a capture form all look equally important.
2. **High scan cost.** Finding Notes or Reminders means reading the whole row every time.
3. **Mobile overflow.** Tabs either scroll horizontally or collapse into an unlabeled overflow menu.
4. **No home for Ask.** A Perplexity-style feature cannot be bolted onto the end of a tab row without becoming another flat tab.

The navigation should express what the user is doing: catching up, browsing the library, researching, or reviewing their thinking.

---

## 2. Navigation design

### 2.1 Information architecture

| Group | Destinations | Why they belong together |
| --- | --- | --- |
| **Today** | Ask ORIN, Daily digest, Archive, Reading list | What changed, what to read next, and what to ask about it. |
| **Library** | Reference Projects, Books, Videos | Saved material organized by format. |
| **Research** | Research, Notes, Reminders | Active investigation and the notes that support it. |
| **Brain** | Live brain | A reflective view over the whole collection. |
| **Capture** | Save a source | An action, not a destination; kept visually separate. |

Future groups such as **Suggestions** and **Workbench** can be added without redesigning the rail. That is the main advantage of grouping now.

### 2.2 Desktop: collapsible left rail

- Persistent rail with section headings, icons, and labels.
- **Save a source** is the primary button at the top; capture should be available from everywhere.
- Active destination gets a surface highlight and a thin accent rule, not a loud filled pill.
- Research can carry a count badge for queued or active work.
- Footer holds **Portfolio**, theme, and **Sign out** so account controls stop competing with content.
- The rail collapses to icons. The collapsed state is remembered locally, so the choice survives refreshes.
- The rail scrolls independently if the list grows.

### 2.3 Mobile: bottom bar plus a sheet

- Fixed bottom bar with four frequent destinations: **Ask**, **Today**, **Saved**, **Research**, plus **More**.
- **More** opens a full-section sheet containing every destination, grouped and labeled.
- The sheet also carries Portfolio, theme, and Sign out.
- Content receives bottom padding for the bar and the safe-area inset.
- No horizontal tab scroller, no tiny unlabeled overflow icon.

### 2.4 Sticky context bar

Once navigation moves into the rail, each page needs a slim header that answers “where am I?” and shows only relevant controls.

- Eyebrow: the current group.
- Title: the current destination.
- Section-specific controls only, such as the digest date picker, archive navigation, or refresh.
- Sticky on scroll, with a paper-tinted backdrop.

This replaces the old toolbar that mixed tabs, date, and refresh in one row.

### 2.5 Command palette

- `⌘K` on macOS, `Ctrl+K` elsewhere.
- Search section names and groups.
- `Enter` opens the first result; `Escape` closes.
- The palette is a fast path for power users, not a replacement for visible navigation.

### 2.6 URL and route behavior

- The active section syncs to `?tab=`, so refresh and shared links work.
- `/orin/videos` redirects to `/orin?tab=videos` instead of maintaining a second page shell.
- Existing data, IDs, bookmarks, notes, reminders, and categories remain untouched.

### 2.7 Why not a left-corner dropdown?

A corner dropdown would reduce visible clutter, but it hides the product:

- Destinations become invisible until opened.
- Grouping is hard to express in a flat menu.
- Active state and counts are easy to miss.
- Mobile and desktop would need two different mental models.
- It saves horizontal space but costs discoverability.

A rail keeps the hierarchy visible and collapses only when the user chooses.

### 2.8 Accessibility

- Real buttons and links, with `aria-current="page"` for the active destination.
- Visible focus states.
- `Escape` closes overlays.
- A skip link to `#main-content`.
- The mobile sheet is a labeled modal dialog.
- The palette has a labeled search field and closes on selection.
- No navigation action depends on hover.

---

## 3. Perplexity-style Ask

### 3.1 Product shape

Ask ORIN should feel like a research conversation, not a search box with a text dump:

1. The user asks a question.
2. ORIN retrieves the most relevant passages from saved items and notes.
3. The answer streams in with inline citation badges such as `[1]`.
4. Source cards appear directly beneath the answer with title, origin, excerpt, and a link.
5. The user can follow up, copy the answer, or save it as a note.
6. Recent conversations remain available.

### 3.2 Start with the library, not the web

Phase 1 should answer **only** from saved material. That is the trust-building step:

- The user can see exactly which saved source supports each claim.
- The feature is useful even before a web-search provider is wired in.
- Retrieval quality can be judged on a known corpus.
- Costs stay bounded.

Web and mixed modes come later, with clear labels for which sources came from the library and which came from the web.

### 3.3 Retrieval

Search passages, not whole documents.

1. Split items and notes into overlapping chunks.
2. Index each chunk with Postgres full-text search.
3. Optionally add embeddings and cosine similarity with pgvector.
4. Fuse keyword and semantic rankings with reciprocal-rank fusion.
5. Fall back to keyword search if embeddings are unavailable.
6. Fall back to a lexical scan of `orin_items` and `orin_notes` before the ask migration exists.

The fallback matters: Ask should work immediately after deploy, then improve when the index is built.

### 3.4 Answer rules

The model should be told to:

- use only the numbered sources in the prompt;
- cite every factual sentence with `[n]`;
- say what is missing when the library does not answer the question;
- distinguish a source claim from inference;
- treat source text as untrusted data, never as instructions;
- return concise plain text without HTML or tables.

The prompt should include whole sources only. If the context budget is exceeded, drop trailing sources rather than cutting a passage mid-way and leaving text with no citation number.

### 3.5 Citation audit

A model can cite a number that was never provided. ORIN should:

- extract cited numbers from the answer;
- compare them with the retrieved source set;
- report invalid citations in the `done` event;
- label invalid citations in the UI instead of pretending the answer is verified.

This is not full entailment checking. It is a cheap guard against invented references.

### 3.6 Conversation history

- Each conversation stores its mode and messages.
- Assistant messages store the cited reference numbers and the exact source cards used.
- Follow-ups reuse the same conversation.
- Recent conversations can be reopened or deleted.
- Persistence is best-effort: if the tables are missing, answers still stream and the UI says the answer was not saved.

### 3.7 Save as note

A good answer should become part of the library, not disappear into chat history.

- Save creates a normal ORIN note.
- The note contains the question, answer, and source list.
- It is editable and versioned like any other note.
- This closes the loop from reading to asking to keeping.

### 3.8 Controls that come later

Phase 2 should add:

- source scope: whole library, a collection, a project, or selected items;
- modes: **My knowledge**, **Web**, **Both**;
- model choice where supported;
- model and cost display;
- source previews before opening a link;
- private collection exclusions;
- conversation search and export.

---

## 4. Phases

The phases below are ordered by user value and risk. They are not a promised schedule.

### Phase 0 — Preserve what works

**Goal:** understand the current behavior before reorganizing it.

- Inventory every ORIN tab, route, action, and data dependency.
- Keep item IDs, dates, categories, notes, reminders, bookmarks, read state, and feedback.
- Add tests around existing behavior before changing navigation.
- Confirm the deployment boundary: the static portfolio, the ORIN Node service, the collector, and the read-only MCP server.

**Ready when:** the navigation change cannot silently drop a feature or a route.

### Phase 1 — Navigation + library-grounded Ask (shipped)

**Navigation**

- Grouped, collapsible desktop rail.
- Mobile bottom bar and section sheet.
- Sticky context bar.
- Command palette.
- URL-synced tabs and the legacy videos redirect.
- ORIN-owned chrome instead of the public site header.

**Ask**

- Library-only answers.
- Streaming SSE response.
- Inline citation badges.
- Source cards.
- Citation audit.
- Recent conversations.
- Save as note.
- Hybrid retrieval when the index exists; lexical fallback otherwise.
- Curated model selector with per-model reasoning effort and a cost/context hint.

**Ready when:**

- Every existing ORIN feature is reachable on desktop and mobile.
- A question about saved material returns an answer with valid citations or clearly says the library is insufficient.
- Conversations and saved answers survive a reload.
- The feature works before the migration through the fallback path.

### Phase 2 — Web, mixed modes, and answer quality

**Build**

- **Web** and **Both** modes, with source provenance labels.
- A search provider with per-run cost limits.
- Source previews and a “why this source” line.
- Expanded model catalog, per-model cost limits, and model comparison.
- Conversation search, rename, and export.
- Private collection exclusions.
- Better citation verification, such as an entailment check or a second-pass review.
- Suggested follow-up questions based on the cited sources.
- A clear “not enough evidence” state that suggests what to save next.

**Ready when:**

- Mixed answers clearly separate library and web sources.
- Invalid or unsupported citations are rare and visible when they occur.
- A user can explain why an answer should be trusted without opening every link.
- Costs per question are visible and bounded.

### Phase 3 — Connect Ask to the rest of ORIN

**Build**

- Ask from a collection, project, book, video, or selected items.
- Deep links from citations back to the exact note or item.
- “Save as research brief” in addition to “Save as note.”
- Turn an answer into Open Questions or a Research job.
- Ask suggestions drawn from recent saves and open questions.
- Cross-conversation memory: “you asked something similar last month.”
- Answer feedback that affects retrieval and ranking.

**Ready when:**

- A question can move cleanly from reading → asking → noting → researching.
- The user does not have to copy sources between features by hand.
- Saved answers remain useful when the original source is deleted or unavailable.

### Phase 4 — Proactive discovery

**Build**

- Weekly “what should I read next?” briefings.
- Suggestions that cite supporting and opposing saved evidence.
- Graph-aware retrieval across topics and connections.
- Scheduled research that writes back into the library.
- Optional audio or review modes.

**Ready when:**

- Suggestions lead to useful investigations in a multi-week trial.
- Proactive features respect cost limits and private exclusions.
- The user can trace how a suggestion led to sources, decisions, and results.

---

## 5. Architecture and data direction

### Keep the existing boundaries

- Portfolio front end and its optional Node server.
- Independent ORIN collector.
- Root-level `api/` handlers for Vercel.
- Read-only MCP server.
- Postgres as the main store.

### Additive data

- `orin_chunks` for passage-level retrieval, full-text search, and optional pgvector embeddings.
- `orin_conversations` for threads and mode.
- `orin_messages` for messages, citations, model, usage, and latency.
- `orin_message_sources` for the exact source cards used by each answer.

The ask schema should stay separate from the core digest schema. A role that cannot install the `vector` extension must not break the digest.

### Streaming

- The answer endpoint emits server-sent events: `sources`, `delta`, `done`, and `error`.
- The UI parses frames rather than assuming one network chunk equals one event.
- A Node host is required for streaming; a static site cannot run the API handlers.

### Security and privacy

- Owner-only access with the existing ORIN session.
- `Cache-Control: private` on every response.
- Provider keys never reach the browser.
- Source text is untrusted input.
- Only validated HTTPS URLs become links.
- Answers render as text, never as model-generated HTML.
- Private collections are excluded before content is sent to a provider.

---

## 6. Design principles

1. **Calm over dense.** Fewer visible choices, clear groups, one primary action.
2. **Citation first.** An answer without support should say so.
3. **Progressive disclosure.** The rail, palette, and section sheet reveal depth without crowding the page.
4. **Mobile parity.** Every destination is reachable on a phone, not just the four in the bottom bar.
5. **Keyboard-first.** `⌘K`, `Escape`, and Enter-to-send should work without a mouse.
6. **No silent failure.** Missing configuration, missing migrations, and unavailable sources are explained.
7. **Preserve the library.** Reorganizing navigation must not rewrite or orphan saved data.
8. **Bound the cost.** Retrieval, context, answer length, and web search all need limits.

---

## 7. How to judge whether it works

### Navigation

- Time to reach a section on desktop and mobile.
- Palette usage and whether it replaces repeated tab scanning.
- No destination becomes unreachable after the redesign.
- No horizontal overflow on a phone.
- Existing links and bookmark state still work.

### Ask

- Percentage of answers with at least one valid citation.
- Percentage of unsupported answers that say the library is insufficient instead of guessing.
- Citation click-through and source-card engagement.
- Save-as-note rate.
- Follow-up rate.
- Time to first token and total latency.
- Cost per answer.
- User feedback on usefulness and trust.

### Later quality checks

- Citation entailment, not just citation existence.
- Answers that combine conflicting sources without flattening the disagreement.
- Answers that identify missing evidence and suggest what to save.
- Retrieval quality across old items, short excerpts, notes, and deleted sources.

---

## 8. Open decisions

- Which web-search provider to use for Phase 2.
- Whether citation verification is a second model pass, a heuristic, or both.
- Whether to expand the curated catalog or add per-user model budgets.
- Whether conversations are searchable by default or opt-in.
- How note citations deep-link into the Notes editor.
- How often the passage index refreshes after new saves.
- Whether Ask eventually gets its own top-level rail group instead of living under **Today**.
- How to export a conversation or a saved answer without losing its sources.

---

## 9. The recommendation in one paragraph

Keep the existing ORIN data and features, but stop presenting them as eleven equal tabs. Group them into a collapsible rail with a mobile bottom bar and a command palette, and give Ask a real home. Make Ask citation-first and library-grounded before adding the web: retrieve passages, stream an answer, show the exact sources, flag invented citations, keep the conversation, and let the user save the answer as a note. Then expand into web and mixed modes, connect Ask to Research/Projects/Notes, and only later add proactive discovery. The navigation and the answer surface should feel like one calm research workspace, not a dashboard with a chat box bolted on.
