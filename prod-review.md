# ORIN product review

**Date:** November 1, 2026  
**Status:** Product decision memo  
**Scope:** How ORIN can make better recommendations about worthwhile research, projects, and writing without overstating what the evidence shows

## 1. Executive decision

ORIN should not yet try to become a fully autonomous idea generator. Its first job should be to improve one important decision:

> Given a question I actively care about, should I spend my next block of time investigating this opportunity, choose a different opportunity, gather one missing piece of evidence, or stop?

The smallest product worth proving is an **evidence-checked opportunity investigation with a recorded result**.

That means ORIN should be able to take one real question, inspect the available evidence, look for work that already answers it, explain the strongest reasons for and against pursuing it, and propose a small test that could change the decision. If the evidence is weak, ORIN should say so. If the opportunity has already been addressed, it should say that too. After the investigation, it should remember what happened and use that result the next time a related idea appears.

This is a narrower goal than “collect everything and tell me what to do every day.” It is also a harder and more useful goal.

The main risk is not a shortage of information. The main risk is a believable but incorrect chain of reasoning:

> incomplete sources → apparent gap → attractive suggestion → personalized explanation → wasted effort

ORIN becomes valuable only if it can repeatedly make this chain more reliable than a strong general-purpose research assistant or the owner’s current process.

## 2. What this review is based on

This review examined the current repository, including:

- `docs/ORIN-PRODUCT-DIRECTION.md`
- `docs/ORIN-RESEARCH.md`
- `docs/ORIN-HYBRID-PILOT.md`
- `docs/ORIN-SOURCES.md`
- The research recommendation, research worker, retrieval, API, schema, and relevant interface code
- Focused research and retrieval tests

`ORIN-PRODUCT-DIRECTION.md` is treated as a research and planning document. Its proposed library, knowledge graph, workbench, experiment notebook, writing system, and other future capabilities are not assumed to be implemented.

“Verified current behavior” in this document means that the behavior is present in the repository code. It does not mean that the live deployment, database migration, scheduled worker, provider credentials, or production reliability were checked.

Fifty-one focused research, retrieval, API, and recommendation tests were run during this review. All passed. These tests are useful evidence about validation, workflow control, citation identifiers, spending guards, cancellation, and failure handling. Most external services and database behavior are mocked. The tests do not establish that research conclusions are correct, that prior-art searches are complete, or that recommendations are valuable.

## 3. What ORIN does today

### 3.1 Collection and daily reading

ORIN collects material from configured feeds and other sources, ranks it for personal relevance, and publishes a private daily reading digest. Much of this collection is based on titles and available excerpts. A collected link or excerpt is not the same thing as a complete review of the external article or paper.

This is useful for discovery. It should not, by itself, support a strong claim that a research area is unexplored.

### 3.2 Research suggestions are heuristic starting points

The Research workbench currently creates up to five suggested investigations from recent and saved items.

The recommender:

- Uses twelve fixed topic patterns.
- Reads item titles and excerpts.
- Looks for words associated with limitations, artifacts, AMD, interests, and goals.
- Can consider up to 200 recently updated items and 100 saved historical items.
- Marks its suggestions as provisional and heuristic.

These suggestions are useful as prompts for further investigation. They are not evidence that ORIN has found a research gap, an important problem, or a feasible project.

The current ranking is mostly a measure of textual resemblance. An AMD mention does not establish AMD compatibility. Limitation language does not establish that the limitation is important or unresolved. A source count does not establish independent agreement.

### 3.3 The research worker performs a staged investigation

A submitted research question can go through a real staged workflow:

1. Plan several research perspectives.
2. Search the saved library and, when enabled, the web.
3. Review the first-pass evidence.
4. Ask evidence-guided follow-up questions.
5. Build an outline linked to evidence.
6. Produce a contribution brief with existing work, counterevidence, limitations, and a proposed experiment.

The resulting brief can have three model-facing outcomes:

- `candidate`
- `insufficient_evidence`
- `already_addressed`

The system also has useful safeguards. It checks that cited evidence identifiers exist, retains search history, distinguishes some source provenance, and prevents a library-only run from claiming a verified external research gap. In web mode, a candidate needs evidence from outside the starting URLs.

These are good foundations, but they do not prove the quality of the conclusion:

- A different URL may be a mirror or may report the same underlying work.
- A citation identifier can exist while the cited passage fails to support the sentence.
- An extracted page may be incomplete.
- A bounded search can miss the closest paper, implementation, or failed attempt.
- A proposed experiment can sound practical while being impossible on the available setup.

### 3.4 Retrieval is useful but bounded

Research library retrieval searches item titles and excerpts. It can use keyword retrieval or an optional hybrid of keyword and semantic retrieval.

The hybrid pilot is evidence about retrieval behavior on a small evaluated snapshot. It is not evidence that ORIN can detect novelty, assess scientific quality, or choose worthwhile contributions.

Notes, past research reports, outcome notes, conversations, and structured experiment results are not generally part of the research worker’s evidence corpus. This limits ORIN’s ability to learn from its own previous investigations.

### 3.5 Personalization exists, but the learning loop is shallow

The research profile includes:

- Interests
- Goals
- Hardware
- Skills
- Available time
- AMD preference

The profile is copied into each research job and supplied to the research model. Only some fields affect the heuristic suggestion ranking.

Owners can record outcomes such as:

- Worth investigating
- Already solved
- Insufficient evidence
- Infeasible
- Experiment started
- Contributed
- Dismissed

At present, this is not a complete learning loop. Only some negative outcomes directly affect later suggestions, mainly by suppressing source URLs. Outcome notes are not generally used as evidence in later research. There is no structured record of an experiment’s configuration, observations, artifacts, and final decision.

Submitting a suggestion also suppresses that particular suggestion while its job is active or completed. This prevents immediate repetition, but it is not the same as learning whether the suggestion was good.

## 4. The central product problem

ORIN should optimize **the quality of a decision**, not the number or attractiveness of its suggestions.

A useful recommendation must answer more than “Is this interesting?” It must answer:

1. Is the underlying claim supported?
2. What is the closest existing work?
3. What remains unresolved after that work is considered?
4. Would resolving it matter?
5. Can this owner test it with the available resources?
6. Is this a better use of effort than the alternatives?
7. What is the cheapest result that would show the recommendation is wrong?

A second brain that cannot answer these questions may still be a useful library or research assistant. It should not yet present itself as a reliable opportunity-selection system.

## 5. The exact decision ORIN should improve

For one active question, at one point in time, ORIN should help choose among:

- Investigate the proposed opportunity.
- Investigate the best alternative.
- Gather one specific piece of missing evidence.
- Wait because the timing or evidence is not right.
- Stop because the question is answered, unimportant, or infeasible.

The objective is to increase worthwhile progress while accounting for:

- The value of resolving the question
- The probability that the next step will produce useful information
- Time and financial cost
- The risk of pursuing a false lead
- The value of the best alternative use of the same time

ORIN should not invent precise probabilities before it has enough outcome data. At first, it should show separate, understandable judgments about evidence, prior-art coverage, feasibility, importance, and personal fit.

### Good outcomes include more than successful projects

A good decision episode can end with:

- A promising direction confirmed
- A false direction rejected cheaply
- Existing work discovered before unnecessary implementation
- A broad idea narrowed into a useful contribution
- A question answered well enough for now
- A decision not to spend more time

Therefore, “do not pursue” and “insufficient evidence” are not product failures. They are failures only when they are wrong, unexplained, or used indiscriminately.

A requirement to produce a recommendation every day would work against decision quality. ORIN needs the explicit option to produce no qualified recommendation.

## 6. Different contributions need different evidence

The same investigation may eventually support a paper, a project, a blog post, and a professional post. That does not mean one source or one experiment automatically justifies all four.

| Contribution | What must be true | Evidence needed before a serious recommendation | Evidence that is not enough |
| --- | --- | --- | --- |
| **Research paper** | An important question remains unresolved, and the proposed work differs meaningfully from the closest work | Relevant primary sources, a careful closest-work search, comparable experimental conditions, a feasible method, and a meaningful evaluation | An abstract mentioning a limitation, no matching library item, or a new combination of familiar techniques |
| **Project or tool** | A real problem matters to someone, existing options are inadequate, and a small artifact can test the idea | A reproduced failure or observed need, comparison with current tools, a target user or workflow, and a smallest useful version | “I did not find a tool” or technical novelty without a clear problem |
| **Technical blog** | Readers lack a useful explanation, synthesis, comparison, or practical evidence | Accurate sources, a defined audience, a clear difference from existing explanations, and preferably original analysis or measurements | Rewriting a paper summary or repeating a trending discussion |
| **LinkedIn post** | A timely, supportable insight would help the intended professional audience | Real experience, a checked observation, or a clearly bounded interpretation | Unsupported novelty claims, generic daily commentary, or copied research summaries |

### When one investigation can support several outputs

Suppose an owner-run experiment produces a useful and properly checked result:

- The research question and evaluation may support a paper.
- The test harness may become a useful open-source project.
- The method and findings may support a technical article.
- One carefully bounded lesson may become a professional post.

The additional value still has to be established separately for each output. A good experiment does not guarantee a publishable paper. A useful harness does not guarantee an interesting article. A timely post does not establish research novelty.

For the first proving ground, these later outputs should remain possible uses of a verified result, not additional automated features.

## 7. The minimum evidence ORIN needs

The goal is not to ingest everything. The goal is to have enough of the right evidence to support one decision.

### 7.1 External evidence

For an AI systems or AMD opportunity, the minimum serious evidence bundle should include:

**Central primary sources**

- Relevant methods, results, limitations, tables, references, and appendices
- Exact source version and publication or revision date
- A clear record of whether ORIN read the complete source, selected pages, or only an excerpt

**Closest existing work**

- The papers, repositories, documentation, or products most similar to the proposed contribution
- Earlier work found through references and later work found through citations where relevant
- A plain explanation of what is the same, what is different, and what remains unresolved

**Executable or operational evidence**

- Repository identity and relevant revision
- Benchmark or reproduction instructions
- Hardware, software, workload, and configuration requirements
- Issues, release notes, or failure reports that affect the claim

**Opposing evidence**

- Existing solutions
- Failed reproductions
- Negative results
- Conflicting evaluations
- Reasons the proposed approach may not matter or may not work

### 7.2 Personal evidence

ORIN also needs the owner’s relevant context:

- The active question in the owner’s own words
- Current goals and the decision that needs to be made
- Available time and financial limits
- Hardware and exact software environment
- Skills demonstrated by previous work
- Relevant projects, drafts, and experiments
- Previous attempts and negative results
- Previous related recommendations and why they were dismissed
- Any distinctive access to hardware, workflows, data, or practical experience

Without this material, ORIN can assess whether an idea is generally interesting. It cannot reliably assess whether the idea is the owner’s best next contribution.

### 7.3 Discovery signals are not serious evidence

ORIN should keep a clear distinction between three levels:

1. **Discovery signals:** social activity, newsletter mentions, feed descriptions, popularity, and heuristic topic matches.
2. **Preliminary evidence:** abstracts, bounded excerpts, titles, issue summaries, and individual claims not yet checked in context.
3. **Serious decision support:** inspectable primary passages, comparable results, executable artifacts, and a closest-work search that has been checked for important omissions.

Discovery signals can decide what to inspect. They should not decide what to build or claim.

### 7.4 Coverage must be visible

Every important evidence record should identify:

- Source or artifact
- Exact passage, page, table, file, or observation
- Version
- Retrieval or observation time
- Whether the text is complete or partial
- Whether it came from the owner, library, or web

ORIN should also keep a search record: queries used, places searched, dates, filters, unreadable sources, and known blind spots.

“No result was returned” is a statement about a search. It is not a statement about the world.

## 8. How ORIN should reason about an opportunity

The system should produce an inspectable argument, not just a polished report.

### Step 1: Freeze the original decision

Before researching, record:

- The active question
- The current date
- The owner’s current belief
- Resource constraints
- The best alternative use of effort
- What decision the research is meant to inform

This prevents the original question from being quietly rewritten after the answer is known.

### Step 2: Build a claim ledger

For every important claim, record:

- The exact supporting passage or observed artifact
- Whether it is a source’s claim, the owner’s observation, or ORIN’s interpretation
- Experimental conditions and source version
- Whether the support has been checked
- What the evidence does not prove

A citation must support the sentence attached to it. A nearby paragraph about the same topic is not enough.

### Step 3: Compare like with like

Compare papers and implementations by:

- Workload
- Hardware
- Software version
- Scale
- Baseline
- Metric
- Evaluation method

Two results may appear to disagree while testing different conditions. ORIN should explain that difference rather than manufacture a controversy or research gap.

### Step 4: Identify possible unresolved differences

An opportunity may come from several situations:

- Important evidence is missing.
- Comparable studies genuinely disagree.
- A method has not been tested under conditions that matter.
- A documented limitation remains unresolved.
- An implementation exists but does not work in the target workflow.
- The owner has a new observation that changes the interpretation.

At this stage, these are candidates for investigation, not established contributions.

### Step 5: Try to prove the opportunity wrong

ORIN should deliberately look for the strongest reasons not to proceed:

- What existing work comes closest to answering the question?
- What is the smallest real difference from that work?
- Has the approach already failed?
- Could unusual terminology explain the missing search results?
- Could inaccessible sources be hiding the answer?
- Is the remaining problem important enough to justify effort?

Finding existing work should improve the recommendation. “Build a new system” may become “test the existing system under an important condition it has not covered.”

### Step 6: Assess value and personal fit separately

An opportunity can be:

- Important but infeasible
- Feasible but unimportant
- Novel but poorly aligned with current goals
- Valuable to the field but better pursued by someone with different resources

ORIN should keep these judgments visible rather than hide them inside a single relevance score.

### Step 7: Propose the cheapest test that could change the decision

The first test should seek evidence that could disprove the idea, not merely produce encouraging results.

It should specify:

- Action
- Baseline
- Metric
- Decision threshold
- Required resources
- Maximum time or spending commitment
- Artifact to retain
- Condition that stops the investigation

### What can be automated

ORIN can automate:

- Retrieval and deduplication
- Source and version manifests
- Draft claim ledgers and comparison tables
- Search records
- Closest-work candidate searches
- Counterevidence searches
- Checks for repeated past recommendations
- Cost and provenance tracking

### What must remain provisional

Until independently checked, ORIN should not treat these as settled:

- Scientific validity
- Source independence
- Citation support for important claims
- Completeness of prior-art coverage
- Importance or novelty
- Hardware and software compatibility
- Personal feasibility
- Correctness of the proposed experiment

ORIN can automate the investigation process. It should not automatically turn that process into a confident conclusion.

## 9. The recommendation contract

Every serious investigation should produce one persistent **Opportunity Dossier**. Its purpose is to let another person inspect why ORIN recommended a commitment of time.

| Field | Required content |
| --- | --- |
| **Decision** | Active question, proposed action, best alternative, and decision date |
| **Status** | Qualified candidate, insufficient evidence, already addressed, do not pursue, or no qualified recommendation |
| **Contribution hypothesis** | The smallest defensible contribution and who would benefit |
| **Supporting evidence** | Important claims with exact passages, versions, locations, coverage, and provenance |
| **Opposing evidence** | Closest work, failures, contradictions, and the strongest reasons not to proceed |
| **Search coverage** | Queries, sources searched, dates, inaccessible material, and known blind spots |
| **Unresolved difference** | What remains unresolved after the closest work is considered |
| **Assumptions** | Conditions that must hold for the opportunity to remain valid |
| **Why now** | New evidence, changed technology, current need, or owner readiness |
| **Why me** | Relevant skill, artifact, access, or perspective; otherwise an honest statement that no distinctive advantage is established |
| **Resources** | Hardware, software, skills, time, money, and dependencies |
| **Cheapest disconfirming test** | Action, baseline, metric, threshold, expected artifact, and maximum commitment |
| **Confidence** | Separate judgments for evidence support, prior-art coverage, feasibility, and personal fit |
| **Kill criteria** | Findings that would make the idea solved, unimportant, infeasible, or worse than an alternative |

### The no-recommendation outcome

`No qualified recommendation` should explain which gate failed:

- Evidence too weak
- Closest work not checked well enough
- Existing work already addresses it
- No meaningful benefit established
- Required resources unavailable
- Better alternative available

It may suggest a small evidence-gathering step. It should not relabel an ordinary project as an “experiment” just to avoid an empty result.

Confidence should remain descriptive until enough judged outcomes exist to support calibrated numerical probabilities.

## 10. Modeling the owner’s comparative advantage

ORIN should keep three kinds of personal information separate.

### Declared information

This is what the owner explicitly states:

- Current goals
- Active questions
- Available time
- Hardware
- Constraints
- Explicit interests

### Observed information

This is supported by artifacts or events:

- Completed projects
- Demonstrated skills
- Experiments and their results
- Published work
- Previous investigations
- Actual dismissal and pursuit decisions

### Inferred information

This is ORIN’s tentative interpretation:

- Possible adjacent interests
- Potential transferable skills
- Topics that may deserve attention

Inferences should be labeled and correctable. Reading, saving, or clicking shows exposure, not intent.

### The four fit questions

A personalized recommendation should answer:

1. **Can I do this?** Are the skills, resources, and time available?
2. **Should I do this?** Does it serve a current goal better than the alternatives?
3. **Am I unusually positioned to do it?** Do I have relevant hardware, operational knowledge, code, data, or previous findings?
4. **Is it worth my next block of effort?** A topic match alone is not enough.

Outcome feedback must also retain its scope. “Infeasible on this GPU within four hours” does not mean “infeasible everywhere.” “Already solved” should link to the work that solved it. A dismissed idea should return only when ORIN can explain what materially changed.

## 11. The smallest proving ground

Start with one owner-authored AI systems or AMD question. Do not start with the automated suggestion feed.

Starting with a real question separates two problems:

- Can ORIN assess an opportunity carefully?
- Can ORIN generate good questions on its own?

The first must be demonstrated before the second is scaled.

### End-to-end experience

1. **Record one real question.** Capture constraints, current belief, and the best alternative use of time.
2. **Investigate it.** Use the existing library and web research workflow, manually adding essential primary sources when retrieval is incomplete.
3. **Create one dossier.** Return either a qualified candidate or an honest no-recommendation result.
4. **Check the important reasoning independently.** Review citation support and closest work before committing substantial effort.
5. **Run the smallest useful investigation manually.** Do not add autonomous experiment execution to this test.
6. **Record what actually happened.** Save configuration, observations, artifacts, result, and the resulting decision.
7. **Ask a related question later.** Require ORIN to retrieve the earlier result and explain how it changed the new recommendation.

This proves or disproves the central product loop:

> Question → evidence → decision → investigation → result → changed future judgment

If this loop does not work for one carefully chosen question, more sources and more suggestions will not fix it.

## 12. Independent evaluation

ORIN should be compared with realistic alternatives, not with an empty prompt or a weak model.

### The three comparison arms

For the same decision episodes, compare:

1. ORIN
2. A strong general-purpose deep-research system
3. The owner’s current workflow

Each arm should have comparable:

- Starting information
- Personal constraints
- Source access
- Spending limit
- Time budget

Save the prompts, outputs, sources, costs, and owner effort. Otherwise, it will be impossible to tell whether ORIN’s additional machinery helped.

### Blinded expert review

Where practical, remove system names and randomize the dossiers before giving them to independent domain experts.

Experts should assess:

- Do the citations support the important claims?
- Is important closest work missing?
- Does the claimed unresolved difference survive scrutiny?
- Would the contribution matter?
- Is the proposed test executable and informative?
- Does the recommendation follow from the evidence?

When possible, ask experts to nominate the closest work before showing them the dossiers. This gives a better measure of what ORIN missed than asking only whether the displayed sources look reasonable.

Several models agreeing with one another is not independent expert review.

### Point-in-time tests

A useful diagnostic is to freeze the available sources at a past date, generate recommendations, and compare them with evidence that appeared later.

This can expose weak retrieval and reasoning. It cannot completely prevent future-knowledge leakage: a model may already know later events from its training even if ORIN restricts its search tools.

Retrospective tests are therefore supporting evidence, not final proof.

### Prospective outcome tests

The decisive evaluation is a series of real decision episodes:

1. Record ORIN’s recommendation before the investigation.
2. Record the baseline and expected decision-changing evidence.
3. Carry out the smallest practical test.
4. Compare the predicted reasoning with what happened.
5. Have important claims and omissions independently reviewed.
6. Check whether later recommendations correctly use the result.

Useful progress can include rejecting a false lead cheaply. Owner satisfaction, clicks, and willingness to read a polished report are not enough.

## 13. Metrics and stop conditions

Do not combine every measure into one score. A high average could hide a small number of severe research-integrity failures.

| Area | What to measure |
| --- | --- |
| **Citation support** | The percentage of important factual claims whose cited passages actually support them |
| **Closest-work coverage** | Important independently nominated work found by ORIN, with extra attention to omissions that invalidate the idea |
| **Validity of the claimed gap** | The percentage of qualified candidates whose unresolved difference survives independent review |
| **Feasibility** | Whether the required environment, resources, baseline, and test procedure are genuinely available |
| **Calibration** | Whether confidence matches later validation, and whether low-coverage investigations correctly abstain |
| **Repeated dismissal** | Whether substantially the same rejected idea returns under new sources or wording |
| **Cost** | Model and search spending plus owner review time per independently validated opportunity |
| **Decision progress** | Questions answered, false leads rejected cheaply, informative experiments completed, or better alternatives selected |
| **Learning** | Whether later dossiers retrieve and correctly use relevant earlier results |

Early evaluation should focus more on the precision of qualified candidates than on how many candidates ORIN can generate.

### Stop or reconsider opportunity selection if

- Important claims repeatedly have citations that do not support them.
- Experts regularly find existing work that invalidates the proposed contribution.
- ORIN does not beat the strong baseline in blinded review or meaningfully reduce owner effort.
- Recommendations remain infeasible even when resource information is accurate.
- ORIN produces candidates but rarely changes a real decision or prevents wasted work.
- Rejected ideas repeatedly return without meaningful new evidence.
- The system cannot use earlier outcomes to improve later reasoning.
- Validated progress costs more money or attention than the current workflow.

If these conditions persist, ORIN should remain an evidence and research-memory workbench rather than claim to select opportunities autonomously.

## 14. The smallest next build decision

Build an **evaluation-ready Opportunity Episode** around the existing research job.

It needs five parts:

1. **Opportunity Dossier**  
   Persist the recommendation contract, including supporting and opposing evidence, search coverage, personal fit, test, confidence, and kill criteria.

2. **Point-in-time evidence manifest**  
   Preserve what was available, what was retrieved, source versions, coverage, queries, and important omissions at the time of the recommendation.

3. **Structured investigation result**  
   Record the configuration, observations, artifacts, actual result, and decision. Keep “not attempted” separate from “attempted and failed.”

4. **Independent evaluation export**  
   Export anonymized dossiers and evidence manifests for baseline comparison and expert review.

5. **Prior-outcome retrieval**  
   On a related investigation, retrieve relevant earlier outcomes and require the new dossier to explain what changed.

This is primarily a decision and evidence layer. It is not another collection system.

### Deliberately excluded from this build

- More source connectors
- Broad full-library ingestion
- Visual knowledge-graph work
- Automatic blog or LinkedIn generation
- Automatic publishing
- Autonomous experiment execution
- More heuristic suggestion categories
- Daily recommendation quotas
- Embedding or ranking optimization unless evaluation shows retrieval is the binding failure
- Numerical confidence scores before calibration data exists

Primary sources can be supplied manually during the proving ground. Building a complete document-processing platform first would make the evaluation slower without answering the central product question.

## 15. The three most dangerous failure modes

### 15.1 Manufactured gaps

Incomplete retrieval, unreadable sources, or misunderstood citations become a confident claim that nobody has addressed a problem.

**Required defense:** visible coverage, checked citation support, closest-work review, and honest no-recommendation outcomes.

### 15.2 Personalization theater

AMD keywords and profile text make an idea look personally suitable even though the required hardware, skills, time, or expected benefit do not fit.

**Required defense:** separate feasibility, goal alignment, comparative advantage, and opportunity-cost judgments.

### 15.3 A self-confirming automation loop

ORIN generates ideas, the owner reads or saves them, and that activity is treated as proof that the ideas were valuable. Negative outcomes and external review never change the system.

**Required defense:** prospective decisions, structured real-world results, independent comparisons, and semantic suppression of rejected ideas unless something material changes.

## 16. What would justify broader automation?

A more automated opportunity feed would become reasonable only after ORIN repeatedly demonstrates that it can:

- Survive independent citation and closest-work review
- Beat a strong baseline in blinded comparisons or substantially reduce investigation effort
- Propose feasible tests that produce decision-relevant evidence
- Deliver real prospective progress, including cheap rejection of false leads
- Use recorded outcomes to improve later judgments
- Abstain when the evidence does not meet the bar

Until then, ORIN’s strongest and most defensible product is:

> **A rigorous opportunity-investigation system that shows its evidence, knows when not to recommend, and learns from what happened.**

That is a meaningful step toward an automated second brain. It avoids confusing fluent synthesis with good judgment, and it tests the part of the vision that would make every later feature more valuable.
