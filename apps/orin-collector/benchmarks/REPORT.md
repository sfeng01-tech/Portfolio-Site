# Orin model comparison — October 25, 2026

**Recommendation: MiMo V2.6 Flash is the most promising next classifier to trial for Orin. Keep Gemini configured until a model change is requested.** MiMo recovered more of the provisionally relevant papers and had the lowest normalized uncached token estimate; Gemini was faster. This is a small task-specific comparison, not proof of general model superiority.

## Same-paper comparison

All models received the same 60 real titles and first 700 excerpt characters, in the same frozen shuffled order, using the production prompt, temperature 0, reasoning disabled and two batches of 30. A separate 10-paper arm supplied the same hypothetical positive and negative feedback to each model. There were no automatic retries, model substitutions, keyword fallbacks or candidate trimming.

| Model | Relevant found / 39 | Selection precision | Top-15 nDCG | Baseline time | Estimated uncached cost / 60 papers | Final requests passing validation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemini 2.5 Flash Lite | 32/39 | 100.0% | 1.000 | 10.1s | $0.002619 | 2/3 |
| DeepSeek V4.1 Flash 1017 | 31/39 | 96.9% | 1.000 | 15.2s | $0.002973 | 3/3 |
| MiMo V2.6 Flash | 35/39 | 100.0% | 1.000 | 28.6s | $0.002082 | 3/3 |

Selection uses score ≥50; reference relevance means grades 2–3. Grade 1 means adjacent discovery and grade 0 means off topic. All models excluded the 15 astronomy/math controls from the score ≥50 selection and got the expected track among their assigned tracks on all 20 systems-paper controls. All top-15 lists contained only grade-3 papers, so this sample does not establish a top-of-list quality winner. Differences appear in mid-list coverage.

Costs in the main table are normalized estimates: reported prompt/completion token counts multiplied by each model’s catalog input/output rates at the run’s start, treating all input as uncached. These estimates exclude cache discounts and may differ from provider-specific billing. DeepSeek and MiMo received substantial cache hits in the final pass while Gemini did not, so their reported charges are not an apples-to-apples cold comparison.

| Model | API-reported baseline charge | Cached input tokens | Routed provider |
| --- | ---: | ---: | --- |
| Gemini 2.5 Flash Lite | $0.002619 | 0 | Google AI Studio |
| DeepSeek V4.1 Flash 1017 | $0.001285 | 10,112 | Relace |
| MiMo V2.6 Flash | $0.000662 | 10,336 | Io Net |

API-reported charges across all three comparison passes plus the diagnostic: **$0.022559**. Failed requests with no usage/cost response are not included; this is a sum of reported charges, not an account invoice. Each comparison plan was preflighted under a $0.10 per-invocation conservative guard.

## Output reliability and request-format finding

The first pass used the original production format with 64-character canonical IDs and prompt-only reason-length guidance. Gemini passed 1/3 requests, DeepSeek 3/3 and MiMo 2/3. Full baseline quality metrics are intentionally withheld when either baseline batch failed validation. A separate Gemini diagnostic reproduced an altered paper ID and a 245-character reason, exceeding Orin’s 240-character bound.

A second experimental schema with short IDs, enums and extra array/text constraints passed DeepSeek and MiMo (3/3 each), but Gemini returned HTTP 400 on both 30-paper requests and still returned an overlong reason in its 10-paper request. That experimental schema was not retained.

The final production-compatible format uses short per-request IDs and an ID enum. Local decoding bounds display reasons to 240 characters, then strictly validates exact candidate coverage, unique/known IDs, integer scores and tracks before restoring canonical IDs. All six final baseline requests passed. Gemini’s final feedback request returned HTTP 429; it was recorded and not retried. These few calls do not estimate production uptime.

## Feedback scenario

This was hypothetical feedback, not actual user history: mark FlashAttention-3 positive and SWE-bench negative. The negative should affect the specific example without rejecting all agent research.

| Model | SWE-bench score before → after | FlashAttention-3 before → after | Other agent paper (ReAct) before → after |
| --- | ---: | ---: | ---: |
| Gemini 2.5 Flash Lite | Not measured: HTTP 429 | Not measured | Not measured |
| DeepSeek V4.1 Flash 1017 | 62 → 30 | 97 → 95 | 65 → 55 |
| MiMo V2.6 Flash | 72 → 30 | 97 → 95 | 65 → 55 |

Both completed feedback runs demoted the negative example below the normal relevance threshold and kept the positive example highly ranked. ReAct stayed relevant but fell by 10 points, so preference spillover deserves further checks with genuine user feedback.

## How to interpret the labels

The 60 papers comprise 20 known systems/quantization/training/agent-infrastructure papers, 25 current Hugging Face Daily Papers entries and 15 current astronomy/math papers fetched from the official arXiv API. Codex assigned the four-level relevance references before any model calls, using the user’s stated interests. They are **provisional agent judgments**, not user-reviewed labels or a neutral benchmark. The sample is purposive, historical systems papers may be familiar to models, and the unrelated controls are relatively easy. No paper’s scientific validity was evaluated.

MiMo’s 35/39 versus Gemini’s 32/39 is a small difference. Do not interpret it as a statistically established quality lead. The next useful validation is for the user to review the disputed papers below and supply actual feedback.

## Disputed selections

Scores below 50 are excluded from ordinary selection; scores 35–49 can still enter discovery slots.

| Paper | Reference grade | Gemini | DeepSeek | MiMo |
| --- | ---: | ---: | ---: | ---: |
| [WeVisOne-VL: Unified Visual Perception from Objects to Pixels](https://huggingface.co/papers/2610.31329) | 1 | 45 | 52 | 40 |
| [TARSphere: A Robot-Oriented Full-Stack Framework for Long-Horizon Embodied Agents in Evolving Physical and Social Environments](https://huggingface.co/papers/2610.30043) | 2 | 60 | 40 | 45 |
| [Diffusion Language Models Change Speed Across Tasks and Languages](https://huggingface.co/papers/2610.25835) | 3 | 30 | 58 | 58 |
| [SplatLab: Autonomous Scientific Discovery for 3DGS Research](https://huggingface.co/papers/2610.30468) | 2 | 40 | 35 | 50 |
| [Direct Preference Optimization: Your Language Model is Secretly a Reward Model](https://arxiv.org/abs/2305.18290v3) | 3 | 70 | 45 | 60 |
| [RIDAR: Safeguarding Research Integrity in Autonomous Research Agents via Automated Detection and Runtime Intervention](https://huggingface.co/papers/2610.31372) | 3 | 35 | 50 | 55 |
| [Agent Mosaic: Recognizing Confidentiality Leaks in Agentic LLM Systems](https://huggingface.co/papers/2610.30418) | 2 | 25 | 48 | 52 |
| [Who Takes the Lead? Model Ability and Task-Conditioned Collaboration with Humans](https://huggingface.co/papers/2610.27148) | 2 | 35 | 58 | 40 |
| [BrickWright: Agentic Creation of Physically Feasible Brick Builds](https://huggingface.co/papers/2610.31651) | 2 | 60 | 45 | 45 |
| [HyperDrone: Simulation-to-Reality Transfer at Millions of Frames per Second](https://huggingface.co/papers/2610.28950) | 2 | 40 | 40 | 50 |
| [RLSplat: Resource-Linear Budget Control for Feed-forward 3D Gaussian Splatting](https://huggingface.co/papers/2610.27712) | 2 | 40 | 35 | 45 |
| [What Makes a Good Unmasking Policy? A Controlled Study of Learned Unmasking in Diffusion Language Models](https://huggingface.co/papers/2610.31576) | 3 | 50 | 45 | 55 |

## Reproduce

```sh
node apps/orin-collector/compare-models.mjs --plan-only
node apps/orin-collector/compare-models.mjs --keychain-openrouter --output /tmp/orin-comparison.json
```

Alternatively set `OPENROUTER_API_KEY` in the environment. The key is never written to results. Re-running uses current provider prices/routes and can yield different outputs, latency and cache discounts. Source data, original failures, the rejected schema variant, the Gemini diagnostic and final raw outputs/usage are retained beside this report. The configured classifier and GitHub Actions model setting were not changed.
