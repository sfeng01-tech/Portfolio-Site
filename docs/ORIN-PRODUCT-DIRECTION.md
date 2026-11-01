# ORIN product direction

**Date:** October 25, 2026  
**Status:** A plan for the product. Proposed features are not built yet unless marked as existing.  
**Based on:** The owner's vision, [Portfolio Site + ORIN Review](../portfolio-orin-review.md) (especially sections 8–12), the current code, and our discussion of competing products and open-source projects.

## 1. What ORIN should become

**ORIN should be a lifelong digital second brain: a place to keep what you learn, connect related ideas, ask questions using your knowledge and the web, and discover worthwhile things to research or build.**

It should help you do three things:

1. **Remember:** Save something now and find it again years later.
2. **Investigate:** Bring a question or idea and get useful sources, explanations, and research help.
3. **Discover:** Get suggestions for papers, projects, improvements, and things to learn without having to ask about a topic first.

You should be able to choose which AI model helps you. Your library should stay with you even when you change models.

Start by making ORIN useful for AI systems research and AMD engineering. But let people save and explore any topic. The long-term product should support knowledge from across their lives.

The basic flow is:

> Save something → connect it to what you know → ask a question or discover an idea → investigate → learn or build → save what happened.

Above all, ORIN should help you decide **what deserves your attention**. The first experience to prove is:

> Question → supporting information → suggested next step → result → a better next suggestion.

These are ideas to test. We have not established that competing products cannot do them.

## 2. How this uses the attached review

The attached review describes ORIN as an **idea-to-evidence desk for AI systems work**. In plain English: you describe what you want to build, and ORIN helps you understand what is known, what is missing, and what to try next.

Keep that direction. Add it to the broader second-brain product rather than making research its only purpose.

| Idea from the review | What it means for ORIN |
|---|---|
| Daily digest | A daily reading summary linked to your permanent library. |
| Eleven AI systems categories | Useful starting topics that you can change or expand. |
| Living topic workspaces | Topic pages that stay up to date with useful sources, new findings, and unanswered questions. |
| Evidence cards and structured claims | A clear record of what a source says, the passage supporting it, and the conditions under which it applies. |
| Knowledge graph | A map of connections between sources, notes, ideas, conversations, projects, and results. |
| Goal profiles and gap analysis | Remember what you want to achieve and look for missing information or promising work. |
| Research chatbot | Help investigate an idea while still allowing ordinary questions and conversation. |
| Saved briefs and experiment plans | Keep research summaries and plans where you can find, update, and use them later. |
| Quality checks | Check whether answers have real support and suggestions are useful. |
| Read-only agent access | Let external AI assistants search ORIN without changing its data. |

This document replaces the review's narrower product direction. The review still matters as a record of the technical assessment, but some problems have since been addressed. Check the current code before treating an old finding as unfinished work.

The review's warning against a generic chatbot should not make ORIN difficult to talk to. A simple question should get a simple answer; it should not always produce a research report.

## 3. What already exists

These features are present in the current code or described in the current project documentation. They were not all retested on the live website for this document.

| Existing feature | What to keep or improve |
|---|---|
| Private space with GitHub sign-in | Keep personal information private and preserve the current sign-in protections. Consider other account options later. |
| Scheduled collection, ranking, and daily summaries | Keep automatic collection and clear notices when a source could not be read. Link summaries to saved items. |
| Archive of past digests | Keep historical items and make them easy to find without choosing a date first. |
| Reading list, read/unread state, and thumbs-up/down | Keep these. Add reasons for feedback before relying heavily on it for suggestions. |
| Editable categories and AI category assignment | Keep manual corrections. Add multiple tags and connections between topics. |
| Source and keyword filters | Add library-wide search that understands both exact words and related meanings. |
| Saving links with a note, category, and date | Make this the starting point for an easy Save action. Keep the link even if ORIN cannot read the page. |
| Reading text from uploaded PDFs | Add page references and original-file storage. Scanned PDFs without readable text are currently rejected; reading text from scanned images would be a new feature. |
| Reference Projects and Books collections | Keep these views. Distinguish a repository saved for reference from a project you are actively building. |
| YouTube video shelf | Keep it. Saving a video link or description does not mean ORIN has read its transcript. |
| Formatted notes, automatic saving, and version history | Include notes in library-wide search while keeping editing and restore options. |
| Weekly and one-time reminders | Keep them. Current notifications require the ORIN page to be open and browser permission. Notifications while the page is closed would be new. |
| Animated Live brain | Keep the visual style. It currently displays connections derived from a digest, not a saved map of the entire library. |
| MCP access for external AI assistants | Keep read-only access to dates, digests, items, and keyword search. Improve relevance and return manageable amounts of information. |
| Protection against weaker digest updates, backup summary models, and duplicate filtering | Preserve these improvements and check what still needs work. |

Tools for repairing and improving old imported links are also being developed in the working files. Do not describe them as verified live features yet.

**A correction to the older review:** ORIN already saves historical items. The missing part is a connected, searchable library covering sources, notes, conversations, and results. Its current external-agent search can find historical items by words, but does not yet understand meaning or search notes alongside those items.

Source references: [ORIN operations](ORIN.md), [MCP documentation](ORIN-MCP.md), [main page](../apps/portfolio/src/pages/OrinPage.jsx), [notes](../apps/portfolio/src/components/orin/OrinNotes.jsx), [collections](../apps/portfolio/src/components/orin/OrinCollections.jsx), [reminders](../apps/portfolio/src/components/orin/OrinReminders.jsx), [videos](../apps/portfolio/src/pages/OrinVideosPage.jsx), and [MCP server](../apps/orin-mcp/server.mjs).

## 4. Main features to build

### 4.1 One lasting library

Keep articles, papers, PDFs, book references, videos, repositories, notes, selected conversations, research summaries, and experiment results in one searchable place.

- Offer an All Knowledge view with filters and saved views. Load large collections in smaller pages.
- Keep the original link, author, publication date, date saved, and where the item came from.
- Show what ORIN could read: just a title, a short description, an excerpt, or the full text.
- Recognize repeated saves of the same source without losing the history of where it was found.
- Allow tags, collections, favorites, archiving, and deletion without making manual filing compulsory.
- Keep personal knowledge until the user chooses to delete it. Temporary files and system logs can have separate storage limits.
- Allow export and restore of notes, links, source details, connections, and research work. Include original files when ORIN stores them and has permission to do so.

Start with pasted links and text. Add a browser extension, bookmark and Markdown imports, and mobile sharing next. Add podcast transcripts, cloud-drive connections, and more file types when users need them.

### 4.2 Automatic organization and connected ideas

A knowledge graph is simply a saved map of how things relate to one another. It should help you find useful connections, not just look impressive.

- Suggest a main topic and several tags while respecting manual corrections.
- Recognize names of people, organizations, models, methods, hardware, datasets, and software versions.
- Recognize when different names refer to the same thing, and let users correct mistakes.
- Connect related sources, notes, projects, and results across the whole library.
- Explain the connection: two sources may discuss the same topic, or one may test, support, or disagree with the other.
- Show why ORIN believes a connection exists and how certain it is.
- Offer a normal searchable list as well as a visual map.

A missing connection is not proof that nobody has researched something.

Keep the review's starting topics: Model Innovation; Training & Scaling; Inference Engineering; GPU & Kernel Engineering; Hardware & Systems; Agents & Tooling; Evaluation & Reliability; Safety, Security & Policy; Data, Retrieval & Knowledge; Developer Tools & Coding; and Industry & Research Practice. Use the topics that matter now, and allow others.

### 4.3 Ask across your knowledge and the web

Chat with one source, a collection, a project, or your whole library. ORIN should search for the relevant passages rather than send every document to the model for every question.

> **Phase 1 shipped:** Ask ORIN is library-only today. It retrieves saved passages, streams a cited answer, keeps conversations, and can save an answer as a note. The **Web** and **Both** modes below are the next phase; the API already rejects non-library modes explicitly instead of silently ignoring them.

Choose where answers come from:

- **My knowledge:** Use saved material and say when it does not contain enough information.
- **Web:** Search outside the library.
- **Both:** Combine saved knowledge and web research, clearly showing which sources came from each.

Keep conversations and their sources so follow-up questions make sense. Let users save useful answers as notes or research summaries. Let them exclude private collections and decide whether a conversation should be searchable in the future.

Offer automatic model selection and a choice of specific models where supported. Show which model is being used and the relevant cost. Changing the model should not lose the sources or conversation. If a chosen model fails, explain the problem instead of silently switching it.

Research answers should show supporting passages. Clearly label an interpretation, a guess, or an idea that needs testing. Brainstorming is welcome, but invented citations and unsupported claims of originality are not.

### 4.4 Deep Research when you ask for it

You should be able to say “Help me explore KV-cache optimization on AMD” and get started without filling out a long form.

ORIN should:

1. Understand the question and ask only for details that would change the research.
2. Search saved knowledge and, if selected, academic sources and the wider web.
3. Find exact terms and related ideas, remove duplicates, and put useful sources first.
4. Follow references and unanswered questions within a visible time and spending limit.
5. Return a reading list explaining why each source matters, what sources agree on, where they disagree, and what remains unknown.
6. Save the research and sources for follow-up work.

Offer a Quick Answer option as well as Deep Research. Longer research should show progress, allow cancellation, keep partial findings, and continue when the browser tab is closed.

For papers, record what was tested, the hardware and software used, the comparison method, results, code availability, and limitations. Say whether ORIN read the whole paper or only its short opening summary, called an abstract.

### 4.5 Suggestions without waiting for a question

Give Suggestions its own page. It should use your library, new information, chosen interests, hardware, goals, previous work, and feedback to propose useful next steps.

| Suggestion | Example |
|---|---|
| Research direction | An unanswered question worth investigating, with supporting sources. |
| Repeat or adapt a study | Test a published technique on your AMD hardware or a different software setup. |
| Performance improvement | Try an optimization and compare it with the current approach. |
| Project | Build a tool that addresses a problem appearing repeatedly in your sources. |
| Product idea | Explore a possible user need, existing alternatives, and a way to check whether people want the solution. |
| Learning path | Read a short sequence of sources to understand something needed for your goals. |
| Unexpected connection | Explore how two ideas might work together, with a clear note that the combination is untested. |

Every serious suggestion should explain:

- What to try and why it matters now.
- Why it fits you, with assumptions you can correct.
- Which sources support it and what similar work already exists.
- What seems to be missing and what ORIN has not checked.
- The first practical step, what to compare against, and how to judge success.
- The hardware, skills, time, and likely spending involved, where these can be estimated.

Let users investigate, save, dismiss with a reason, revisit later, or start a project.

Start with a weekly review and no more than three featured suggestions. Offer more on request. Send notifications only for useful new opportunities or meaningful changes to followed ideas.

Use honest descriptions:

| Description | What it means |
|---|---|
| Missing from your library | ORIN has not found the answer in your saved material. |
| Possible research gap | A wider search found little relevant work, but that does not prove the idea is new. |
| Limitation named by the authors | A source explicitly describes what it did not solve. |
| Worth testing in another setting | Existing work could be tried under different conditions. |
| Product idea to validate | A possible need that still requires checking competitors and talking to potential users. |

Never turn “we did not find it” into “nothing like this exists.” Keep a record of searches, dates, sources, and similar work. Depending on the idea, check code repositories, performance tests, documentation, and products as well as papers.

### 4.6 Topic pages, missing evidence, and Workbench

These features carry forward the research direction in the attached review.

**Topic pages:** Maintain a current overview, the best starting sources, recent changes, key ideas, disagreements, available code, and unanswered questions. Show whether the page relies on many independent sources or mostly one community.

**Records of source claims:** Keep what a source says alongside the exact passage, test conditions, measurement, and result. A claim in a paper is not automatically an established fact. Avoid comparing results from very different conditions as if they were equivalent.

**Missing evidence:** Help distinguish several problems: the library lacks information; only opinions exist; an experiment cannot be reproduced; a technique has not been tested on the relevant hardware or scale; sources are outdated; or credible sources disagree. Explain which sources were checked. A missing test is not automatically a worthwhile project.

**Workbench:** Keep active ideas and projects together with their goals, requirements, sources, notes, research summaries, proposed explanations, experiment plans, tasks, reminders, and results. Show whether work is being explored, planned, run, completed, or dismissed.

Keep unsuccessful experiments and abandoned ideas too. They should help future suggestions, while remaining clearly labeled as the user's own findings rather than independently verified research.

### 4.7 Open Questions and what you want to achieve

Give unanswered questions their own place. For example:

> “Can this technique run efficiently on my AMD hardware?”

Attach sources, possible answers, disagreements, suggestions, and experiments to that question over time.

- Create a question directly or save one from a note, conversation, or suggestion.
- Mark it open, under investigation, answered for now, or paused.
- Keep earlier answers when new information changes them.
- Revisit followed questions when useful evidence arrives.
- Let the user decide when the answer is good enough. Silence or a lack of new sources does not mean the question is solved.

Keep an editable research plan: current goals, questions, skills to learn, available hardware, time and money, and work already completed or abandoned. Show and allow corrections to interests ORIN infers. Reading about something does not necessarily mean you want to work on it.

Offer three ways to request suggestions:

| Mode | What it helps with |
|---|---|
| **Advance my work** | Move an active question or project forward. |
| **Expand my thinking** | Discover relevant ideas outside familiar topics. |
| **Something I can finish** | Find worthwhile work that fits a few hours, a weekend, or another chosen limit. |

Keep this lightweight. It should help choose a few practical next steps, not become another demanding task list.

### 4.8 Suggestions that check why they might be wrong

Before recommending serious work, ORIN should check:

1. Has someone already done it?
2. Does the apparent gap come from missing or unreadable sources?
3. Have people tried and failed, or explained why it may not work?
4. Can this user reasonably test it with their available resources?
5. Should the suggestion be changed or dropped?

Show **Why this might fail**, the strongest evidence against the idea found so far, and what result would show the idea is wrong. Keep these checks within a time and spending limit, and say when they are incomplete. Several AI models agreeing does not prove that an idea is new or practical.

Finding existing work should improve the suggestion. “Build this from scratch” could become “Test the existing implementation under conditions the authors have not checked.” Explain why it changed.

### 4.9 What changed my understanding?

The digest should sometimes explain how new information changes something you already saved:

> “Your note says this feature is unsupported. A newer release appears to add support. Your experiment plan may need updating.”

Link the old statement, new source, affected work, and a suggested next step. Check whether the difference is a real disagreement or simply a different version, workload, or hardware setup.

Propose edits for the user to review. Do not silently rewrite their notes or conclusions. Keep the earlier versions and record accepted changes. Prioritize active questions and let users choose how often to hear about updates.

### 4.10 An experiment notebook that remembers results

Include a simple experiment record in the first Suggestions release.

Record what you expected, what you tested, the hardware and software, the starting performance or comparison method, the steps taken, the measure of success, the actual result, and what you think it means. Attach useful files or logs.

Mark an experiment planned, attempted, completed, or unclear. An experiment that was never run did not fail.

Remember negative results with their conditions:

> “This change did not help with this workload and configuration.”

Do not assume it will fail everywhere. Before repeating an old suggestion, check earlier experiments and dismissals. If new evidence, hardware, or goals make it worth another try, explain what changed.

### 4.11 Writing with sources attached

Let a research summary grow into a paper outline, technical article, project proposal, or README without losing its sources.

ORIN should point out:

- Statements with no supporting source.
- Conclusions that go beyond what the evidence shows.
- Comparisons between results from different conditions.
- Places where another source or experiment is needed.

Clearly separate published findings, your own measurements, and experiments you have only proposed. Export drafts with references and notes about unresolved questions.

Start with outlines and source checks after the basic research experience works. Good writing and a long reference list do not guarantee a valid scientific result or a paper ready for publication.

## 5. Other useful features, in priority order

| Feature | Why it helps | When |
|---|---|---|
| Highlights and comments attached to passages | Find your own thoughts alongside the original source. | Early |
| “Why am I seeing this?” | Understand and correct personalized suggestions. | Early |
| Follow an Open Question | Hear when new information could help answer it. | Basic version with Suggestions; more alert options later |
| Mark outdated or changed sources | Avoid treating old software information as current. | After reliable search |
| Export research as Markdown with references | Use it in papers, project files, and other tools. | Early |
| Show related saved items while browsing | Bring earlier knowledge back when it is relevant. Recall already does this. | Later |
| Quizzes and scheduled review | Remember what you have learned. | Later, optional |
| Audio summaries and reading aloud | Learn while away from the screen. | Later, optional |
| Reminders when ORIN is closed | Make reminders more reliable outside the website. | Later |
| Share selected research or collections | Work with others while keeping the rest private. | After clear access controls |
| Compare models using the same sources | Check answer quality and cost fairly. | Internal testing first |

Keep the current Live brain, but postpone more elaborate animation, audio, quizzes, and large numbers of app connections until the main research experience proves useful. Shared quizzes, broad social features, and AI that automatically runs experiments are also later possibilities.

## 6. How the app could be organized

| Page | What belongs there |
|---|---|
| **Today** | Daily digest, source problems, recently saved items, important updates, and a few suggestions. |
| **Library** | All saved knowledge, including Archive, Reading list, Books, Videos, Reference Projects, Notes, topics, and the connection map. |
| **Ask** | Conversations using My knowledge, Web, or Both, with model choice. |
| **Suggestions** | Recommended work, supporting and opposing evidence, dismissed ideas, and followed questions. |
| **Workbench** | Goals, Open Questions, active projects, research, experiments, writing, and reminders. |

Make saving something available from every page. Keep notes easy to create without starting a project. When reorganizing the current tabs, preserve existing links, information, and useful features.

## 7. How ORIN could stand out and stay affordable

Recall already has saving, summaries, automatic tags and connections, library and web chat, model choice on an applicable plan, reminders of related content while browsing, and learning features. These are not unique selling points for ORIN.

The idea to test is:

> ORIN helps you turn what you know into worthwhile research and projects, then remembers what you learned from trying them.

Compare this with what Recall can do when given a good prompt. Judge the quality of sources, relevance to the person, checks for existing work, follow-through, ability to export information, and total cost.

To control costs:

- Reuse document summaries and analysis until the content or processing approach changes.
- Use cheaper models for simpler work when testing shows they are good enough.
- Use stronger models and more searches when the question needs them.
- Focus regular reviews on new information instead of rereading everything.
- Put clear limits on deep research and expensive model use.
- Consider letting users supply their own API keys, while showing that they still pay the model provider.
- Measure hosting, storage, search, document processing, model usage, and support costs separately.

Do not promise a price yet. Personal use may be inexpensive, but a service for other people must cover its real costs. Free hosting allowances and unpaid development time do not establish that it can be run profitably.

[Recall's pricing page](https://www.recall.it/pricing) previously showed Plus at $10/month billed annually and explicit model choice in Max at $38/month billed annually during this discussion. Recheck before quoting those prices publicly.

## 8. Open-source projects worth considering

Start with one research tool. Keep ORIN's saved knowledge and permissions separate from it so we can change tools later.

| Project | How it could help | Suggested approach |
|---|---|---|
| [GPT Researcher](https://github.com/assafelovic/gpt-researcher) | Research websites and documents and produce reports with sources. | First candidate to connect as a separate research service. Apache-2.0 license. |
| [PaperQA](https://github.com/Future-House/paper-qa) | Answer questions using scientific documents and citations. | Use as a comparison when testing academic answer quality, or add it if it clearly improves results. Apache-2.0. |
| [Local Deep Research](https://github.com/LearningCircuit/local-deep-research) | Research with models running locally or online, academic searches, and private documents. | An alternative when local use and provider choice matter. MIT. |
| [dzhng/deep-research](https://github.com/dzhng/deep-research) | A small research program that searches, learns, and follows up. | A useful starting point if we build our own version using the project's existing Node/TypeScript tools. MIT. |
| [STORM / Co-STORM](https://github.com/stanford-oval/storm) | Explore a topic from several perspectives and write a sourced overview. | Learn from its approach to topic pages. Check current maintenance before using its code. MIT. |
| [AI Scientist](https://github.com/SakanaAI/AI-Scientist) | Generate ideas, check literature, run experiments, and review results. | Borrow ideas for proposing and challenging research. Review its custom license before copying code. Do not assume its experiment setup supports AMD. |
| [LangChain Open Deep Research](https://github.com/langchain-ai/open_deep_research) | Coordinate research steps and evaluate reports. | Use as a reference. Its repository was archived when checked. MIT. |

These notes reflect checks made during this discussion. Before choosing a project, check its current state, license, required software, handling of private information, and behavior when a step fails. Test a fixed version so results are repeatable. Open source does not make model calls, search, or hosting free.

## 9. How to build it without losing what works

Keep the current project structure: the portfolio app, separate collector, root `api/` folder, and read-only MCP server. MCP is the connection that lets external AI assistants read ORIN. Keep its local connection, hosted connection, and bridge separate as they are today.

Long research tasks should run in the background rather than depend on a page staying open. If we choose a Python research tool, run it as a separate service instead of rewriting the existing app.

Keep Postgres as the main database. Add search by exact words and by meaning. Start by storing connections in the same database; add another database only if testing shows it is needed.

Store enough information to support:

- Sources, files, source versions, passages, and where each item came from.
- Notes and their earlier versions.
- Topics, tags, named concepts, connections, and what sources claim.
- Conversations and the exact sources used in answers.
- Goals, questions, skills, hardware, available time and money, and feedback.
- Suggestions, checks for existing work, research summaries, projects, experiments, and results.
- Changes to earlier understanding, proposed note edits, and the user's decisions.
- Writing drafts and statements that still need support.
- Processing progress, model choices, spending, errors, and cancelled work.

Add these features without overwriting old data. Preserve item IDs, dates, categories, notes, reminders, bookmarks, read status, and feedback. Preparing old material for the new search should be restartable and should not stop normal reading.

External AI assistants should continue to read through MCP without writing to the database. The signed-in app and narrowly permitted background services can save research results. Instructions found inside a document must not be treated as commands to the system.

If a user excludes a collection, do not send its content to the model. Explain when content is sent to an external provider. When something is deleted, remove it from future search and update related generated material where needed. Saved research should clearly show when a supporting source is no longer available.

## 10. Suggested order of work

This is an order of priorities, not a promised schedule. Keep existing features working throughout.

| Stage | What to build | How we know it is ready |
|---|---|---|
| **0. Check and preserve** | Confirm current features and fixes, capture limits, and how existing data will be kept. | The feature list matches actual behavior, and update tests preserve personal information. |
| **1. One searchable library** | Search across sources and notes, remove duplicates, keep source details, load large lists in pages, and begin export support. | Real questions find useful material across dates and formats. Excluded or deleted items stay out. |
| **2. Ask and Research** | Global chat, source choice, model choice, saved conversations and Open Questions, one research tool, source previews, and spending limits. | Answers have real support or explain what is unknown. Research stays within limits, and questions and sources remain available later. |
| **3. Suggestions and results** | Personal goals, weekly suggestions, the three suggestion modes, checks for existing and opposing evidence, followed questions, and simple experiment records. | A four-week trial shows whether suggestions lead to useful investigations. Later suggestions reflect earlier decisions and results. |
| **4. A fuller Workbench** | Updated topic pages, richer experiments, changes to earlier understanding, writing help, alerts, and a library-wide connection map. | Users can trace how a question led to sources, decisions, experiments, and writing. |
| **5. More ways to save and learn** | Browser/mobile capture, more file types, notifications while the app is closed, optional audio/quizzes, and selective sharing. | New features meet real needs without making answers worse or costs unreasonable. |

Recommendations do not need to wait for a sophisticated graph display. Good search, reliable source reading, and checks for existing work come first.

## 11. How to judge whether it works

Test models and research tools on the same small set of real questions. Include specific hardware and software versions, questions spanning topics, missing information, conflicting sources, personal notes, old material, and sources where only a title or description is available.

| Area | Questions to measure |
|---|---|
| Saving | How often can ORIN read a source? Are duplicates caught? How soon can it be searched? Are failures explained? |
| Search | Does it find the sources we expect? Are the most useful results near the top? Does it match the right version? Is it fast enough? |
| Answers | Do the cited passages actually support the answer? Are guesses and interpretations labeled? |
| Suggestions | Are they useful, relevant, and achievable? Are they already known? Did ORIN check opposing evidence? Does it repeat dismissed ideas? |
| Progress | Did a question move forward, an experiment happen, or a learning goal improve? Does the user return? |
| Updates | Do new findings change a useful decision? How many alerts are irrelevant? Are proposed edits accepted? |
| Writing | Does ORIN catch unsupported statements and preserve source links? |
| Cost | What does each saved document, answer, deep-research task, and useful suggestion cost? What does a month of use cost? |
| Ownership | Can users export and restore their information? Does deletion work? Is private information kept out of excluded searches? |

Compare ORIN with a good prompt given to a strong model using the same sources, and with Recall where accessible. The extra steps in ORIN should produce better results or make ongoing work easier. Choose numerical targets after measuring the starting point.

## 12. The first experience to prove

Build **one saved question, one carefully checked suggestion, and one recorded result**:

1. Make existing items and notes searchable together.
2. Save a real AMD systems question and the relevant goals and limits.
3. Search the library and web, then show useful sources and an answer that names what remains unknown.
4. Save the research summary with its sources.
5. Suggest one practical investigation. Check existing work, look for reasons it may fail, and explain both.
6. Record whether the owner chooses to try it. If they do, save what they compared, what happened, and what it means.
7. Use the result and new information to improve the next suggestion.

Try this for four weeks with a small weekly Suggestions feed. Record which ideas were investigated, what progress resulted, why others were dismissed, and whether the owner returned without reminders.

Useful progress can mean answering a question, deciding not to build something, or learning from an unsuccessful experiment. It does not have to mean a finished project.

If this experience does not repeatedly help the owner choose worthwhile work and move forward, improve the sources, relevance, and practicality before adding more features. Keep the lifelong library as the foundation, and prove the value of research and suggestions first.
