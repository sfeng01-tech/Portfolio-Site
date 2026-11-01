import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, FlaskConical, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './OrinResearch.css';

const EMPTY_PROFILE = { interests: [], goals: '', hardware: '', skills: '', timeBudget: '', amdFocus: 'preferred' };
const OUTCOMES = [['worth-investigating', 'Worth investigating'], ['already-solved', 'Already solved'], ['infeasible', 'Not feasible for me'], ['insufficient-evidence', 'Insufficient evidence'], ['experiment-started', 'Experiment started'], ['contributed', 'Contributed'], ['dismissed', 'Dismissed']];
const humanize = value => String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, character => character.toUpperCase());
const safeLink = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; } };
const draft = (value = {}) => ({ key: globalThis.crypto.randomUUID(), question: '', prompt: '', sources: [], ...value });

async function request(method = 'GET', body, signal) {
  const response = await fetch('/api/orin/research', {
    method, signal, credentials: 'same-origin', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw Object.assign(new Error(result.error || 'Research could not be loaded. Check that the ORIN server and research migration are available.'), { status: response.status });
  return result;
}

// All generated content is rendered as text, including unexpected result fields.
// Only validated HTTPS links become anchors; report HTML is never interpreted.
function ResultValue({ value, depth = 0 }) {
  if (value === null || value === undefined || value === '') return null;
  if (depth > 6) return <p>{JSON.stringify(value)}</p>;
  if (typeof value !== 'object') return <p className="orin-research-text">{String(value)}</p>;
  if (Array.isArray(value)) return <ul className="orin-research-result-list">{value.map((entry, index) => <li key={index}><ResultValue value={entry} depth={depth + 1}/></li>)}</ul>;
  return <dl className="orin-research-result-fields">{Object.entries(value).map(([key, entry]) => <div key={key}><dt>{humanize(key)}</dt><dd>{key === 'url' && safeLink(entry) ? <a href={safeLink(entry)} target="_blank" rel="noopener noreferrer">{entry} <ArrowUpRight size={12}/></a> : <ResultValue value={entry} depth={depth + 1}/>}</dd></div>)}</dl>;
}

// Keep the researcher’s working notes available alongside the concise brief;
// neither a model-generated citation nor a perspective implies verification.
function ResearchResult({ result }) {
  if (!result?.summary && !result?.outcome) return <ResultValue value={result}/>;
  const evidence = Array.isArray(result.evidence) ? result.evidence : [];
  const claims = Array.isArray(result.claims) ? result.claims : [];
  const fields = [
    ['Opportunity', result.opportunity], ['AMD relevance', result.amdBenefit],
    ['Existing work', result.existingWork], ['Counterevidence', result.counterevidence],
  ].filter(([, value]) => typeof value === 'string' && value.trim());
  const technicalKeys = new Set(['outcome', 'title', 'summary', 'opportunity', 'amdBenefit', 'existingWork', 'counterevidence', 'claims', 'limitations', 'nextQuestions', 'experiment', 'evidence', 'perspectives', 'outline', 'searchLog', 'verification', 'model', 'reservedUsd', 'generatedAt', 'scope']);
  const other = Object.fromEntries(Object.entries(result).filter(([key]) => !technicalKeys.has(key)));
  return <div className="orin-research-brief">
    {result.title && <h4>{result.title}</h4>}
    {result.outcome && <p className="orin-research-status">{humanize(result.outcome)}</p>}
    {result.summary && <p>{result.summary}</p>}
    {fields.map(([label, value]) => <section key={label}><h5>{label}</h5><p>{value}</p></section>)}
    {claims.length > 0 && <section><h5>Evidence-backed claims</h5><ul className="orin-research-claims">{claims.map((claim, index) => <li key={index}><span>{claim.statement}</span> <small>({humanize(claim.kind || 'source claim')}{Array.isArray(claim.evidenceIds) && claim.evidenceIds.length ? ` · ${claim.evidenceIds.join(', ')}` : ''})</small></li>)}</ul></section>}
    {result.experiment && <section><h5>Proposed next experiment</h5><ResultValue value={result.experiment}/></section>}
    {result.limitations?.length > 0 && <section><h5>Limitations</h5><ResultValue value={result.limitations}/></section>}
    {result.nextQuestions?.length > 0 && <section><h5>Open questions</h5><ResultValue value={result.nextQuestions}/></section>}
    {result.outline && <details><summary>Research outline</summary><ResultValue value={result.outline}/></details>}
    {result.perspectives && <details><summary>Perspectives and follow-up questions</summary><ResultValue value={result.perspectives}/></details>}
    {evidence.length > 0 && <details><summary>Sources and evidence ({evidence.length})</summary><ResultValue value={evidence}/></details>}
    {result.searchLog?.length > 0 && <details><summary>Search history</summary><ResultValue value={result.searchLog}/></details>}
    {Object.keys(other).length > 0 && <details><summary>Additional research details</summary><ResultValue value={other}/></details>}
    {result.verification && <p className="orin-research-meta">{result.verification}</p>}
  </div>;
}

function JobCard({ job, onAction, onContinue, busy, queueFull }) {
  const [outcome, setOutcome] = useState(job.feedback?.outcome || 'worth-investigating');
  const [notes, setNotes] = useState(job.feedback?.notes || '');
  const active = ['queued', 'running'].includes(job.status);
  return <article className="orin-research-card">
    <div className="orin-research-row"><span className={`orin-research-status status-${job.status}`}>{humanize(job.status)}</span><small>{job.createdAt ? new Date(job.createdAt).toLocaleString() : ''}</small></div>
    <h3>{job.question}</h3>
    {job.progress && <p>{job.progress}</p>}
    {job.error && <p className="orin-research-warning">{job.error}</p>}
    <p className="orin-research-meta">{job.options?.scope === 'web' ? 'Library + web' : 'Library only'} · {job.options?.depth === 'deep' ? 'Deep research' : 'Standard research'} · Reserved budget: ${Number(job.spentUsd || 0).toFixed(4)}</p>
    {active && <button type="button" disabled={busy} onClick={() => onAction(job.id, 'cancel')}>Cancel investigation</button>}
    {typeof job.result?.summary === 'string' && <p className="orin-research-preview">{job.result.summary.slice(0,300)}{job.result.summary.length > 300 ? '…' : ''}</p>}
    {job.result && <details className="orin-research-result orin-research-read"><summary>{job.status === 'completed' ? 'Read brief' : 'Read partial findings'}</summary><ResearchResult result={job.result}/></details>}
    <details className="orin-research-result"><summary>Research instructions and starting sources</summary><ResultValue value={{ prompt: job.prompt, batchPrompt: job.options?.batchPrompt, perspectives: job.options?.perspectives, sources: job.sources }}/></details>
    {job.status === 'completed' && <button type="button" disabled={busy || queueFull} onClick={() => onContinue(job)}>Continue investigation</button>}
    {!active && <details className="orin-research-outcome"><summary>Record an outcome{job.feedback?.outcome ? ` · ${humanize(job.feedback.outcome)}` : ''}</summary><form className="orin-research-feedback" onSubmit={event => { event.preventDefault(); onAction(job.id, 'feedback', { outcome, notes }); }}>
      <label>What happened next?<select value={outcome} onChange={event => setOutcome(event.target.value)}>{OUTCOMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Outcome notes<textarea value={notes} maxLength={4000} rows={2} placeholder="What did you learn or try?" onChange={event => setNotes(event.target.value)}/></label>
      <button disabled={busy} type="submit">Save outcome</button>{job.feedback?.outcome && <small>Saved: {humanize(job.feedback.outcome)}</small>}
    </form></details>}
  </article>;
}

export default function OrinResearch({ active, seeds = [], onClearSeeds, revision = 0, incomingDraft, onConsumeDraft, onNewInvestigation }) {
  const { expireSession } = useAuth();
  const [view, setView] = useState('activity');
  const [reviewing, setReviewing] = useState(false);
  const consumedDraft = useRef(null);
  const workspaceRef = useRef(null);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [profileDirty, setProfileDirty] = useState(false);
  const profileDirtyRef = useRef(false);
  const [interests, setInterests] = useState('');
  const [jobs, setJobs] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [queue, setQueue] = useState([]);
  const [batchPrompt, setBatchPrompt] = useState('');
  const [scope, setScope] = useState('library');
  const [depth, setDepth] = useState('deep');
  const [perspectives, setPerspectives] = useState('');
  const [maxUsd, setMaxUsd] = useState('1');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  // A lost response must not turn an identical retry into another paid batch.
  // A changed draft receives a fresh identifier; the server also checks the payload.
  const submissionRef = useRef(null);

  useEffect(() => {
    if (!incomingDraft || consumedDraft.current === incomingDraft.id) return;
    if (queue.length >= 10) { setView('drafts'); setError('Your draft queue is full. Remove a draft before adding this question.'); return; }
    consumedDraft.current = incomingDraft.id;
    setQueue(current => [...current, draft({ question: incomingDraft.question, sources: incomingDraft.sources || [] })]);
    setView('drafts'); setMessage(incomingDraft.notice || 'Review your question, starting sources and budget before starting.'); onConsumeDraft?.();
  }, [incomingDraft, onConsumeDraft, queue.length]);
  useEffect(() => { setReviewing(false); }, [queue, scope, depth, maxUsd, batchPrompt, perspectives, profile, interests]);
  useEffect(() => { if (active && seeds.length) setView('drafts'); }, [active, seeds.length]);
  useEffect(() => {
    if (active) requestAnimationFrame(() => workspaceRef.current?.scrollIntoView({ block: 'start' }));
  }, [view, active]);

  const report = useCallback(err => {
    if (err.name === 'AbortError') return;
    if (err.status === 401) { expireSession(); return; }
    setError(err.message || 'Research request failed.');
  }, [expireSession]);

  const load = useCallback(async signal => {
    const data = await request('GET', undefined, signal);
    if (signal?.aborted) return;
    if (!profileDirtyRef.current) {
      setProfile(data.profile || EMPTY_PROFILE);
      setInterests((data.profile?.interests || []).join(', '));
    }
    setJobs(data.jobs || []); setSuggestions(data.suggestions || []); setCapabilities(data.capabilities || {}); setLoaded(true);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    setLoading(true); setError('');
    load(controller.signal).catch(report).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active, revision, load, report]);

  const running = jobs.some(job => ['queued', 'running'].includes(job.status));
  useEffect(() => {
    if (!active || !running) return undefined;
    const controller = new AbortController();
    let inFlight = false;
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible' || inFlight) return;
      inFlight = true;
      try { await load(controller.signal); } catch (err) { report(err); } finally { inFlight = false; }
    }, 10000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [active, running, load, report]);

  function editProfile(field, value) { profileDirtyRef.current = true; setProfileDirty(true); setProfile(current => ({ ...current, [field]: value })); }
  async function saveProfile(event) {
    event.preventDefault(); setBusy('profile'); setError(''); setMessage('');
    try {
      const next = { ...profile, interests: interests.split(',').map(value => value.trim()).filter(Boolean) };
      const data = await request('POST', { action: 'profile', profile: next });
      setProfile(data.profile || next); profileDirtyRef.current = false; setProfileDirty(false); setMessage('Research profile saved.'); await load();
    } catch (err) { report(err); } finally { setBusy(''); }
  }
  function addDraft(value) {
    if (queue.length >= 10) { setError('A batch can contain up to 10 investigations.'); return; }
    setView('drafts'); setReviewing(false);
    setQueue(current => [...current, draft(value)]); setMessage('Added to the research queue. Review the question and instructions before submitting.');
  }
  function continueInvestigation(job) {
    const evidence = Array.isArray(job.result?.evidence) ? job.result.evidence : [];
    const previousSources = Array.isArray(job.sources) ? job.sources : [];
    const seen = new Set();
    const sources = [];
    for (const source of [...evidence, ...previousSources]) {
      const url = safeLink(source?.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      sources.push({ url, title: typeof source.title === 'string' ? source.title.slice(0, 500) : url,
        ...(typeof source.excerpt === 'string' ? { excerpt: source.excerpt.slice(0, 4000) } : {}),
        ...(/^[a-f0-9]{64}$/.test(source.itemId || '') ? { itemId: source.itemId } : {}) });
      if (sources.length === 20) break;
    }
    addDraft({ question: job.question, prompt: `Continue investigation ${job.id} using the supplied sources. Check existing work, current evidence, and counterevidence.`, sources });
    requestAnimationFrame(() => {
      const heading = document.getElementById('orin-research-queue-heading');
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  function updateDraft(key, changes) { setQueue(current => current.map(item => item.key === key ? { ...item, ...changes } : item)); }
  function updateSources(item, value) {
    // Preserve original excerpts for URLs retained in the edited list.
    const sources = value.split('\n').filter(line => line.trim()).map(line => {
      const url = line.trim(); return item.sources.find(source => source.url === url) || { url, title: url };
    });
    updateDraft(item.key, { sources, sourceText: value });
  }
  async function submit(event) {
    event.preventDefault(); if (busy || !queue.length) return;
    if (queue.some(item => item.question.length > 1500)) { setError('Research questions are limited to 1500 characters. Shorten the question before continuing.'); return; }
    if (profileDirty) { setError('Save your research profile before submitting this batch.'); return; }
    if (queue.some(item => !item.question.trim() || item.sources.length > 20 || item.sources.some(source => !safeLink(source.url)))) { setError('Every investigation needs a question and at most 20 sources with valid HTTPS URLs.'); return; }
    const perspectiveList = perspectives.split('\n').map(value => value.trim()).filter(Boolean);
    if (perspectiveList.length > 3 || perspectiveList.some(value => value.length > 200)) { setError('Enter up to three perspectives, each no longer than 200 characters.'); return; }
    if (!reviewing) { setReviewing(true); setError(''); return; }
    setBusy('submit'); setError(''); setMessage('');
    try {
      const payload = { action: 'submit', jobs: queue.map(({ key, sourceText, ...item }) => item), batchPrompt, scope, depth, perspectives: perspectiveList, maxUsd: Number(maxUsd) };
      const fingerprint = JSON.stringify(payload);
      if (submissionRef.current?.fingerprint !== fingerprint) submissionRef.current = { fingerprint, requestId: globalThis.crypto.randomUUID() };
      await request('POST', { ...payload, requestId: submissionRef.current.requestId });
      submissionRef.current = null;
      setQueue([]); setView('activity'); setReviewing(false); setMessage('Batch submitted. Investigations will continue in the background when the research worker is running.'); await load();
    } catch (err) { report(err); } finally { setBusy(''); }
  }
  async function jobAction(id, action, feedback) {
    setBusy(id); setError(''); setMessage('');
    try { await request('PATCH', { id, action, ...(feedback ? { feedback } : {}) }); setMessage(action === 'cancel' ? 'Investigation cancelled. Partial findings are retained.' : 'Outcome saved.'); await load(); }
    catch (err) { report(err); } finally { setBusy(''); }
  }

  const canSubmit = capabilities?.library === true;
  const webAvailable = capabilities?.web === true;
  return <section ref={workspaceRef} className="orin-research" hidden={!active} aria-label="Research workspace">
    <header className="orin-research-header"><p>Track deeper questions, review the evidence, and decide what to try next.</p><div className="orin-research-row"><button type="button" className="button-primary" onClick={() => onNewInvestigation ? onNewInvestigation() : addDraft()}><Plus size={15}/> New investigation</button><button type="button" disabled={loading || Boolean(busy)} aria-label="Refresh research" onClick={() => { setError(''); load().catch(report); }}><RefreshCw size={16}/></button></div></header>
    {error && <div role="alert" className="orin-error">{error}</div>}
    {message && <p className="orin-research-notice" role="status">{message}</p>}
    {loading && !loaded && <p role="status">Loading your research workspace…</p>}
    <nav className="orin-research-views" aria-label="Investigation views">{[['activity', 'Activity'], ['drafts', `Drafts · ${queue.length}`], ['explore', 'Explore'], ['profile', 'Profile']].map(([value, label]) => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}</nav>
    <div hidden={view !== 'activity'}>    <section className="orin-research-section"><div className="orin-research-row"><h3>Investigations & outcomes</h3>{running && <span className="orin-research-meta" role="status">Updates every 10 seconds while visible</span>}</div><p>Completed briefs distinguish evidence, interpretations, and unknowns. Record what happened next to guide future research.</p><div className="orin-research-jobs">{[...jobs].sort((a, b) => Number(['queued', 'running'].includes(b.status)) - Number(['queued', 'running'].includes(a.status))).map(job => <JobCard key={job.id} job={job} busy={Boolean(busy)} queueFull={queue.length >= 10} onAction={jobAction} onContinue={continueInvestigation}/>)}</div>{loaded && !jobs.length && <p className="orin-research-empty">Your submitted investigations and contribution briefs will appear here.</p>}</section></div>
    <div hidden={view !== 'drafts'}>    <section className="orin-research-section"><div className="orin-research-row"><h3 id="orin-research-queue-heading" tabIndex={-1}>Research drafts <span className="orin-research-count">{queue.length}/10</span></h3><button type="button" disabled={queue.length >= 10} onClick={() => addDraft()}><Plus size={14}/> New question</button></div>
      {seeds.length > 0 && <div className="orin-research-seeds"><strong>{seeds.length} selected reading source{seeds.length === 1 ? '' : 's'}</strong><ul>{seeds.map(source => <li key={source.url}>{source.title}</li>)}</ul><div className="orin-research-row"><button type="button" disabled={queue.length >= 10} onClick={() => { addDraft({ sources: seeds }); onClearSeeds(); }}>Investigate these sources together</button><button type="button" onClick={onClearSeeds}>Clear selection</button></div></div>}
      <p>Drafts stay while you switch tabs and clear when you leave or sign out. Review the plan before starting.</p>
      <form onSubmit={submit}>
        {queue.map((item, index) => <fieldset key={item.key} className="orin-research-card" disabled={busy === 'submit'}><legend>Investigation {index + 1}</legend><div className="orin-research-row"><span className="orin-research-meta">Edit before submission</span><button type="button" aria-label={`Remove investigation ${index + 1}`} onClick={() => setQueue(current => current.filter(entry => entry.key !== item.key))}><Trash2 size={15}/></button></div><label>Research question<textarea required maxLength={1500} value={item.question} rows={2} onChange={event => updateDraft(item.key, { question: event.target.value })} placeholder="What unresolved problem is worth contributing to?"/></label><details><summary>Instructions · {item.sources.length} starting source{item.sources.length === 1 ? '' : 's'}</summary><label>Instructions for this investigation<textarea maxLength={5000} value={item.prompt} rows={3} onChange={event => updateDraft(item.key, { prompt: event.target.value })} placeholder="Specify the workload, comparisons, assumptions to challenge, or desired contribution."/></label><label>Starting sources · one HTTPS URL per line<textarea value={item.sourceText ?? item.sources.map(source => source.url).join('\n')} rows={3} onChange={event => updateSources(item, event.target.value)} placeholder="https://…"/></label><small>Links are starting references. A saved excerpt or retrieved evidence is required before a source can support a finding.</small></details></fieldset>)}
        {queue.length > 0 && <div className="orin-research-batch"><h4>Research plan</h4><details><summary>Additional instructions and perspectives</summary><label>Instructions for every investigation<textarea value={batchPrompt} maxLength={5000} rows={3} onChange={event => setBatchPrompt(event.target.value)} placeholder="For example: check current implementations first, prioritize work I can prototype in two weekends, and look for counterevidence."/></label><label>Perspectives to include, optional · up to 3, one per line<textarea value={perspectives} rows={3} maxLength={602} onChange={event => setPerspectives(event.target.value)} placeholder={'For example: AMD deployment feasibility\nSafety and robustness\nExisting implementations and competing work'}/></label><small>Leave blank for perspectives chosen for your question. Each perspective can be at most 200 characters.</small></details><div className="orin-research-grid"><label>Research scope<select value={scope} onChange={event => setScope(event.target.value)}><option value="library">My library only</option><option value="web" disabled={!webAvailable}>My library + web{!webAvailable ? ' (not configured)' : ''}</option></select></label><label>Research depth<select value={depth} onChange={event => setDepth(event.target.value)}><option value="standard">Standard · focused follow-up</option><option value="deep">Deep · broader perspectives and follow-up</option></select></label><label>Maximum USD for this batch<input type="number" required min="0.10" max="25" step="0.10" value={maxUsd} onChange={event => setMaxUsd(event.target.value)}/></label></div><p>{queue.length} investigation{queue.length === 1 ? '' : 's'} · total maximum ${Number.isFinite(Number(maxUsd)) ? Number(maxUsd).toFixed(2) : '—'}. The allowance is split equally between investigations. Deep research can use more searches and model calls. If an investigation reaches its allocation, it stops with partial findings. Reservations are estimates; provider billing can differ.</p>{profileDirty && <p className="orin-research-warning">Save your profile changes before submitting.</p>}{reviewing && <div className="orin-research-confirm" role="status"><strong>Ready to start {queue.length} investigation{queue.length === 1 ? '' : 's'}?</strong><p>{scope === 'web' ? 'Library + web' : 'Library only'} · {depth === 'deep' ? 'Deep' : 'Standard'} · Maximum ${Number(maxUsd).toFixed(2)} total. Your question, profile and source excerpts will be sent to the configured providers.</p><button type="button" onClick={() => setReviewing(false)}>Back to editing</button></div>}<button className="button-primary" type="submit" disabled={Boolean(busy) || !canSubmit || profileDirty || !queue.length}>{busy === 'submit' ? 'Submitting…' : reviewing ? `Confirm and start ${queue.length} investigation${queue.length === 1 ? '' : 's'}` : 'Review research plan'}</button></div>}
      </form>
      {loaded && <p className="orin-research-notice">{capabilities?.message || 'Research execution is not configured yet. You can prepare questions and save your profile; submission becomes available once the research model and worker are configured.'}</p>}
      {!queue.length && !seeds.length && <p className="orin-research-empty">Start with a suggested investigation, your own question, or “Add to research” on a reading item.</p>}
    </section>

</div>
    <div hidden={view !== 'explore'}>    <section className="orin-research-section"><div className="orin-research-row"><h3>Suggested investigations</h3><span className="orin-research-meta">Starting questions · gaps not yet verified</span></div>
      <p>Suggestions use your interests and library excerpts. Deep research checks the evidence, existing work, and feasibility.</p>
      <div className="orin-research-suggestions">{suggestions.map(suggestion => <article key={suggestion.id} className="orin-research-card"><span className="eyebrow">SUGGESTED QUESTION</span><h4>{suggestion.topic || 'Explore a question'}</h4><p>{suggestion.question}</p><details><summary>Sources and rationale</summary><p>{suggestion.reason}</p><dl className="orin-research-dimensions">{Object.entries(suggestion.dimensions || {}).map(([name, detail]) => <div key={name}><dt>{humanize(name)}</dt><dd>{typeof detail === 'object' ? <><strong>{detail.label}</strong><p>{detail.reason}</p></> : String(detail)}</dd></div>)}</dl></details><button type="button" disabled={queue.length >= 10 || queue.some(item => item.suggestionId === suggestion.id)} onClick={() => addDraft({ question: suggestion.question, prompt: suggestion.prompt || '', sources: suggestion.sources || [], suggestionId: suggestion.id })}><Plus size={14}/> {queue.some(item => item.suggestionId === suggestion.id) ? 'In queue' : 'Add to research queue'}</button></article>)}</div>
      {loaded && !suggestions.length && <p className="orin-research-empty">No suggestions yet. Update your interests, save relevant sources, or start a new investigation.</p>}
    </section>

</div>
    <div hidden={view !== 'profile'}>    <details open className="orin-research-profile"><summary>Your research profile {profileDirty && <span>· Unsaved changes</span>}</summary><form onSubmit={saveProfile}>
      <label>Interests, separated by commas<textarea value={interests} maxLength={3000} rows={3} onChange={event => { setInterests(event.target.value); profileDirtyRef.current = true; setProfileDirty(true); }} placeholder="Training, inference, GPU kernels, agents, RL, harnesses, model safety…"/></label>
      <label>What would you like to contribute?<textarea value={profile.goals} maxLength={4000} rows={3} onChange={event => editProfile('goals', event.target.value)}/></label>
      <div className="orin-research-grid"><label>Available hardware<textarea value={profile.hardware} maxLength={2000} rows={2} placeholder="GPU models, memory, cluster or cloud access" onChange={event => editProfile('hardware', event.target.value)}/></label><label>Skills and areas to learn<textarea value={profile.skills} maxLength={2000} rows={2} onChange={event => editProfile('skills', event.target.value)}/></label><label>Time available<input value={profile.timeBudget} maxLength={500} placeholder="For example, two weekends" onChange={event => editProfile('timeBudget', event.target.value)}/></label><label>AMD relevance<select value={profile.amdFocus} onChange={event => editProfile('amdFocus', event.target.value)}><option value="preferred">Prefer a concrete AMD benefit</option><option value="required">Require AMD mentions in suggested sources</option><option value="optional">Explore across ecosystems</option></select></label></div>
      <button type="submit" disabled={Boolean(busy) || !loaded}>{busy === 'profile' ? 'Saving…' : 'Save research profile'}</button>
    </form></details>

</div>
  </section>;
}
