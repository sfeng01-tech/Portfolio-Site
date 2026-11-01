import { createHash } from 'node:crypto';

// A transparent, inexpensive shortlist. These rules identify questions worth
// checking, never establish novelty, scientific quality, or hardware support.
const THEMES = [
  ['Model safety', /\b(safety|alignment|jailbreak|prompt injection|red.team|guardrail)\b/i, 'Which safety limitations are supported by these sources, and what bounded evaluation or mitigation could address them?'],
  ['Reinforcement learning', /\b(reinforcement|reward|rollout|ppo|grpo|rlhf|rlaif|rl)\b/i, 'What limits the reliability or efficiency of this reinforcement-learning workflow, and what reproducible improvement is feasible?'],
  ['Agent harnesses and evaluation', /\b(agents?|agentic|harness\w*|tool.use|benchmarks?|graders?)\b/i, 'Which agent or evaluation-harness failure remains unresolved, and how could an executable test establish a useful contribution?'],
  ['GPU kernels and portability', /\b(kernel|triton|hip|cuda|compiler|gpu programming|portability)\b/i, 'Which operator, shape, or architecture exposes a verified performance or correctness limitation, and what is the smallest useful kernel contribution?'],
  ['Quantization', /\b(quantiz\w*|int4|int8|fp4|fp8|low.bit|low.precision)\b/i, 'Which quantization tradeoffs remain unresolved for the target workload, including measured speed, quality, and safety behavior?'],
  ['Distillation', /\b(distill\w*|student model|teacher model)\b/i, 'Could a deployment-aware distillation experiment address a documented limitation while preserving task quality and safety?'],
  ['On-device deployment', /\b(on.device|edge|npu|ryzen|mobile|local inference|heterogeneous)\b/i, 'Which model or execution constraint limits practical on-device deployment, and what measurable improvement could be contributed?'],
  ['Inference and serving', /\b(inference|serving|speculative|decoding|batching|prefix cach\w*)\b/i, 'Which inference feature interaction or workload bottleneck is unresolved, and what integration or experiment would improve it?'],
  ['Training and fine-tuning', /\b(train\w*|fine.tun\w*|lora|optimizer|convergence)\b/i, 'Which training memory, stability, or throughput limitation is supported, and can a bounded experiment improve it?'],
  ['Distributed infrastructure', /\b(distributed|infrastructure|checkpoint|collective|rccl|nccl|fault.toleran\w*|scheduling)\b/i, 'Which distributed-system bottleneck or recovery failure remains unresolved, and what reproducible infrastructure contribution would help?'],
  ['Long-context memory', /\b(kv.cache|long.context|offload\w*|cache eviction)\b/i, 'Which long-context memory policy improves a real workload without unacceptable quality or latency regressions?'],
  ['Mixture of experts', /\b(moe|mixture.of.experts|expert parallel|expert routing)\b/i, 'Where do expert routing, small batches, or communication limit this workload, and which contribution could measurably help?'],
];
const AMD = /\b(amd|rocm|radeon|instinct|ryzen|rccl|aiter|mi[234]\d{2}\w*|hip)\b/i;
const LIMITATION = /\b(limitations?|unsupported|unresolved|bottleneck|regression|fails?|failure|missing|trade.off|future work|open question)\b/i;
const ARTIFACT = /\b(benchmark|repository|github|code|dataset|reproducer|implementation|experiment)\b/i;
const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 24);

function seed(item) {
  try {
    const url = new URL(item.url);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.hash = '';
    return { url: url.href, title: normalize(item.title).slice(0, 300) || url.hostname,
      excerpt: normalize(item.excerpt).slice(0, 2000), ...(item.id ? { itemId: item.id } : {}) };
  } catch { return null; }
}

export function recommendInvestigations(items = [], profile = {}, jobs = [], signals = {}) {
  const interests = Array.isArray(profile.interests) ? profile.interests.join(' ') : '';
  const context = `${interests} ${profile.goals || ''}`;
  const unique = new Map();
  for (const raw of items) {
    if (Number(raw?.feedback) === -1) continue;
    const item = seed(raw);
    if (!item) continue;
    const previous = unique.get(item.url);
    if (!previous || previous.excerpt.length < item.excerpt.length) unique.set(item.url, item);
  }
  const used = new Set(jobs.filter(job => job.status !== 'failed' && job.status !== 'cancelled')
    .map(job => job.options?.suggestionId).filter(Boolean));
  const rejectedUrls = new Set(jobs.filter(job => ['already-solved', 'dismissed'].includes(job.feedback?.outcome))
    .flatMap(job => (job.sources || []).map(source => source.url)));
  const candidates = [];
  for (const [topic, pattern, researchQuestion] of THEMES) {
    const matched = [...unique.values()].filter(item => pattern.test(`${item.title} ${item.excerpt}`) && !rejectedUrls.has(item.url));
    if (!matched.length) continue;
    matched.sort((a, b) => Number(LIMITATION.test(b.excerpt)) - Number(LIMITATION.test(a.excerpt)) || Number(AMD.test(`${b.title} ${b.excerpt}`)) - Number(AMD.test(`${a.title} ${a.excerpt}`)) || (signals[b.itemId] || 0) - (signals[a.itemId] || 0) || a.url.localeCompare(b.url));
    const sources = matched.slice(0, 4);
    // A source title is untrusted. Never promote it into the owner question or
    // the research instructions; it travels only as source data.
    const question = researchQuestion;
    const suggestionId = `research-${hash(`${topic}:${sources.map(source => source.url).sort().join('|')}`)}`;
    if (used.has(suggestionId)) continue;
    const text = sources.map(source => `${source.title} ${source.excerpt}`).join(' ');
    const directAmd = AMD.test(text);
    if (profile.amdFocus === 'required' && !directAmd) continue;
    const directInterest = pattern.test(context);
    const limitation = LIMITATION.test(text);
    const artifact = ARTIFACT.test(text);
    const semantic = sources.some(source => Number(signals[source.itemId]) > 0);
    const score = (directInterest ? 6 : 0) + (limitation ? 4 : 0) + (artifact ? 1 : 0) + (semantic ? 1 : 0)
      + (directAmd && profile.amdFocus !== 'optional' ? 2 : 0) + Math.min(sources.length, 2);
    candidates.push({ id: suggestionId,
      topic, question, sources, provisional: true, method: semantic ? 'heuristic+semantic' : 'heuristic', score,
      prompt: 'Check current primary sources, related implementations, issues and PRs. Seek counterevidence and existing solutions. Distinguish capability gaps, shared unresolved problems, and engineering improvements. State search coverage and uncertainty. Assess AMD benefit where concrete; do not infer absence from missing search results. Propose one feasible experiment with baseline, metrics, and stopping conditions.',
      reason: `${sources.length} source${sources.length === 1 ? '' : 's'} discuss this topic. ${semantic ? 'Some relate to your interests or explicit feedback. ' : ''}${limitation ? 'The excerpts mention a limitation to verify.' : 'Whether a worthwhile gap exists needs investigation.'}`,
      dimensions: {
        interest: { label: directInterest ? 'Profile match' : 'Adjacent discovery', reason: directInterest ? 'Matches your stated interests or goals.' : 'An adjacent topic from your library; relevance is provisional.' },
        amdBenefit: { label: directAmd ? 'AMD mentioned' : 'Transfer unverified', reason: directAmd ? 'The source text mentions AMD-related technology; benefit still needs validation.' : 'No direct AMD connection established. Check whether the idea transfers.' },
        evidence: { label: limitation ? 'Limitation signal' : 'Gap unverified', reason: 'Based on source excerpts, not a full-text or prior-art review.' },
        feasibility: { label: 'Needs assessment', reason: profile.hardware || profile.timeBudget ? 'Research must check your hardware and time constraints against the proposed experiment.' : 'Add hardware and time constraints to your profile.' },
        researchValue: { label: limitation ? 'Resolve a stated uncertainty' : 'Check existing work', reason: artifact ? 'The excerpts mention code, data, or experiments that may support a practical check.' : 'Locate primary evidence and accessible artifacts before recommending work.' },
      },
    });
  }
  // Distinct topics and a deterministic tie break avoid popularity/freshness
  // dominating the shortlist. Sources can support different research questions.
  return candidates.sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic))
    .slice(0, 5).map(({ score, ...candidate }) => candidate);
}
