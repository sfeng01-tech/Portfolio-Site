import React, { useMemo, useState } from 'react';
import { Activity, ArrowUpRight, Bookmark, Compass, Network, Radio } from 'lucide-react';
import { buildBrainModel, digestFreshness, displaySource, formatAge, layoutBrain, neighborhood, shortLabel } from './brainGraph';
import OrinBrain3D from './OrinBrain3D';

const safeUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch { return null; }
};

const LABEL_LIMIT = 18;

function Neuron({ node, active, dimmed, showLabel, onSelect }) {
  const className = ['orin-brain-node', `is-${node.kind}`, active ? 'is-active' : '', dimmed ? 'is-dimmed' : ''].filter(Boolean).join(' ');
  const fill = node.kind === 'source' ? node.color : node.kind === 'topic' ? 'var(--accent)' : 'var(--ink)';
  const caption = node.kind === 'item' ? shortLabel(node.label, LABEL_LIMIT) : node.kind === 'source' ? `${node.caption || node.label} · ${node.count}` : node.label;
  return <g className={className} role="button" tabIndex={0} aria-pressed={active}
    aria-label={`${node.kind === 'topic' ? 'Topic segment' : node.kind === 'source' ? 'Source neuron' : 'Action neuron'}: ${node.label}`}
    onClick={() => onSelect(node)} onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node); }
    }}>
    <title>{node.kind === 'item' ? node.label : caption}</title>
    <circle className="orin-brain-halo" cx={node.x} cy={node.y} r={node.r + 6}/>
    <circle cx={node.x} cy={node.y} r={node.r} fill={fill} opacity={node.kind === 'item' ? (node.read ? 0.32 : 0.92) : 0.9}
      stroke={node.saved && node.kind === 'item' ? 'var(--accent)' : 'transparent'} strokeWidth={node.saved && node.kind === 'item' ? 2.2 : 0}/>
    {(node.kind !== 'item' || showLabel) && <text className={`orin-brain-node-label${node.kind === 'topic' ? ' is-strong' : ''}`}
      x={node.kind === 'source' ? node.x - node.r - 12 : node.x + node.r + 12} y={node.y + 3.5}
      textAnchor={node.kind === 'source' ? 'end' : 'start'}>{caption}</text>}
  </g>;
}

function FocusDetail({ node, model, onSelect }) {
  if (!node) return <>
    <div className="eyebrow"><Network size={13}/> TRACE</div>
    <h4>Follow the signal</h4>
    <p className="orin-brain-note">Pick a source, a topic segment, or an action neuron to see how today&rsquo;s information moved and what it produced.</p>
  </>;
  const topics = node.kind === 'item'
    ? node.topicIds.map((id) => model.topics.find((topic) => topic.id === id)?.label).filter(Boolean)
    : model.topics.filter((topic) => topic.id === node.id).flatMap((topic) => topic.topics);
  const sourceIds = node.kind === 'item' ? [node.sourceId] : node.kind === 'source' ? [node.id] : [...new Set(model.items.filter((item) => item.topicIds.includes(node.id)).map((item) => item.sourceId))];
  const thread = node.kind === 'item' && node.threadId ? model.threads.find((entry) => entry.id === node.threadId) : null;
  return <>
    <div className="eyebrow">{node.kind === 'topic' ? 'TOPIC SEGMENT' : node.kind === 'source' ? 'SOURCE NEURON' : 'ACTION NEURON'}</div>
    <h4>{node.label}</h4>
    {topics.length > 0 && <div className="orin-brain-chips">{topics.map((topic) => <span key={topic}>{topic}</span>)}</div>}
    <dl className="orin-brain-facts">
      {sourceIds.length > 0 && <div><dt>Sources</dt><dd>{sourceIds.map((id) => displaySource(model.sources.find((source) => source.id === id)?.source)).join(', ')}</dd></div>}
      {node.kind !== 'item' && <div><dt>Items</dt><dd>{node.kind === 'source' ? node.count : model.items.filter((item) => item.topicIds.includes(node.id)).length}</dd></div>}
      {node.kind === 'source' && <div><dt>Segments</dt><dd>{new Set(model.items.filter((item) => item.sourceId === node.id).flatMap((item) => item.topicIds)).size}</dd></div>}
      {node.kind === 'topic' && <div><dt>Topics</dt><dd>{(model.topics.find((topic) => topic.id === node.id)?.topics || []).join(', ')}</dd></div>}
      {node.kind === 'item' && <div><dt>Segment</dt><dd>{topics.join(', ')}</dd></div>}
      {thread && <div><dt>Thread</dt><dd>{thread.label}</dd></div>}
      {node.kind === 'item' && <div><dt>Fit</dt><dd>{node.score}{node.discovery ? ' · discovery' : ''}</dd></div>}
      {node.kind === 'item' && <div><dt>State</dt><dd>{node.read ? 'read' : 'unread'}{node.saved ? ' · saved' : ''}{node.feedback === 1 ? ' · more like this' : node.feedback === -1 ? ' · less relevant' : ''}</dd></div>}
    </dl>
    {node.kind === 'item' && safeUrl(node.url) && <a className="orin-brain-open" href={safeUrl(node.url)} target="_blank" rel="noopener noreferrer">Open source <ArrowUpRight size={13}/></a>}
    {node.kind === 'source' && <ul className="orin-brain-list">{model.items.filter((item) => item.sourceId === node.id).slice(0, 6).map((item) => <li key={item.id}>
      <button type="button" onClick={() => onSelect(item)}>
        <span className="orin-brain-seg">{item.score}</span>
        <span className="orin-brain-list-title">{item.label}</span>
      </button>
    </li>)}</ul>}
  </>;
}

export default function OrinBrain({ items = [], groups = [], date = '', sourceStatus = [], availableDates = [] }) {
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('brain');
  const model = useMemo(() => buildBrainModel({ items, groups }), [items, groups]);
  const view = useMemo(() => layoutBrain(model), [model]);
  const focus = useMemo(() => (selectedId ? neighborhood(model, selectedId) : null), [model, selectedId]);
  // Recomputed on each render rather than memoised, so the age stays honest.
  const freshness = digestFreshness({ items, sourceStatus, date, availableDates });

  const itemsById = useMemo(() => new Map(model.items.map((node) => [node.id, node])), [model.items]);
  const sourcesById = useMemo(() => new Map(model.sources.map((node) => [node.id, node])), [model.sources]);
  const selectedNode = selectedId ? view.nodes.find((node) => node.id === selectedId) : null;
  const selection = selectedNode ? (selectedNode.kind === 'item' ? selectedNode : model.sources.find((s) => s.id === selectedId) || model.topics.find((t) => t.id === selectedId)) : null;
  const selectionItems = !selectedNode ? [] : selectedNode.kind === 'item'
    ? [model.items.find((node) => node.id === selectedId)]
    : model.items.filter((item) => (selectedNode.kind === 'source' ? item.sourceId === selectedNode.id : item.topicIds.includes(selectedNode.id)));
  const showItemLabels = model.items.length <= 16;
  const toggle = (node) => setSelectedId((current) => (current === node.id ? null : node.id));

  return <section className="orin-brain" aria-label="ORIN live actions brain">
    <header className="orin-brain-head">
      <div className="orin-brain-top">
        <div className="eyebrow"><Activity size={14}/> LIVE ACTIONS BRAIN</div>
        <div className="orin-brain-views" role="group" aria-label="Brain view">
          <button type="button" aria-pressed={viewMode === 'brain'} onClick={() => setViewMode('brain')}>3D brain</button>
          <button type="button" aria-pressed={viewMode === 'flow'} onClick={() => setViewMode('flow')}>Flow</button>
        </div>
        <div className={`orin-brain-live${freshness.stale ? ' is-stalled' : ''}`}>
          <i aria-hidden="true"/> {date ? `SYNCED ${date}` : 'AWAITING SIGNAL'}
          {` · COLLECTED ${formatAge(freshness.ageHours)}`}
          {freshness.stale ? ' · COLLECTOR STALLED' : ''}
        </div>
      </div>
      <p>Each source neuron fires into the topic segments it reported on, and every segment carries that signal into the action neurons it produced. Similar topics are merged into one segment, so a single idea can light up from several feeds at once.</p>
      <div className="orin-brain-stats">
        <span><b>{model.stats.items}</b> neurons</span>
        <span><b>{model.stats.sources}</b> sources</span>
        <span><b>{model.stats.segments}</b> topic segments</span>
        <span><b>{model.stats.threads}</b> threads</span>
        <span><b>{model.stats.links}</b> links</span>
        <span><b>{model.stats.unread}</b> unread</span>
        <span><b>{model.stats.saved}</b> saved</span>
      </div>
    </header>

    {!model.items.length ? <div className="orin-state"><Compass size={27} strokeWidth={1.2}/><h3>No signal to trace yet.</h3><p>The brain lights up once a collection run publishes a digest.</p></div> : <>
      {viewMode === 'brain'
        ? <OrinBrain3D model={model} selection={selectedId} focus={focus} showItemLabels={showItemLabels} onSelect={toggle}/>
        : <div className="orin-brain-mapwrap">
        <svg className="orin-brain-map" viewBox={`0 0 ${view.width} ${view.height}`} role="img"
          aria-label={`${model.stats.sources} sources feeding ${model.stats.segments} topic segments across ${model.stats.items} items`}
          onClick={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
          <g className="orin-brain-links">
            {view.links.map((link, index) => <g key={link.id} className={!focus || focus.has(link.from) || focus.has(link.to) ? '' : 'is-dimmed'}>
              <path className={`orin-brain-link is-${link.kind}`} d={link.d} style={{ strokeWidth: Math.min(2.4, 0.8 + link.weight * 0.35) }}/>
              <path className="orin-brain-flow" d={link.d} pathLength={1}
                style={{ '--flow-duration': `${2.4 + (index % 7) * 0.42}s`, '--flow-delay': `${-(index * 0.19)}s` }}/>
            </g>)}
          </g>
          <g className="orin-brain-nodes">
            {view.nodes.map((node) => <Neuron key={node.id} node={node} active={selectedId === node.id} showLabel={showItemLabels}
              dimmed={Boolean(focus) && !focus.has(node.id)} onSelect={toggle}/>)}
          </g>
        </svg>
        <p className="orin-brain-axis" aria-hidden="true"><span>sources</span><span>topic segments</span><span>actions</span></p>
      </div>}

      <div className="orin-brain-panel">
        <div className="orin-brain-card">
          <div className="eyebrow"><Radio size={13}/> SEGMENTS</div>
          <ul className="orin-brain-list">
            {model.topics.map((topic) => <li key={topic.id}>
              <button type="button" onClick={() => toggle(topic)} aria-pressed={selectedId === topic.id}>
                <span className="orin-brain-seg">{topic.count}</span>
                <span className="orin-brain-list-title">{topic.label}</span>
                <span className="orin-brain-list-meta">{topic.topics.length} topic{topic.topics.length === 1 ? '' : 's'}</span>
              </button>
            </li>)}
          </ul>
        </div>
        <div className="orin-brain-card">
          <div className="eyebrow"><Compass size={13}/> {selectedNode ? 'IN THIS SIGNAL' : 'THREADS'}</div>
          {selectedNode ? <ul className="orin-brain-list">
            {selectionItems.slice(0, 8).map((node) => <li key={node.id}>
              <button type="button" onClick={() => toggle(node)} aria-pressed={selectedId === node.id}>
                <span className="orin-brain-dot" style={{ background: sourcesById.get(node.sourceId)?.color }}/>
                <span className="orin-brain-list-title">{node.label}</span>
                <span className="orin-brain-list-meta">{node.saved ? <Bookmark size={11} fill="currentColor"/> : node.source ? displaySource(node.source) : ''}</span>
              </button>
            </li>)}
            {selectionItems.length > 8 && <li className="orin-brain-more">+{selectionItems.length - 8} more</li>}
          </ul> : <ul className="orin-brain-list">
            {model.threads.map((thread) => <li key={thread.id}>
              <button type="button" onClick={() => toggle(itemsById.get(thread.itemIds[0]))}>
                <span className="orin-brain-seg">{thread.itemIds.length}</span>
                <span className="orin-brain-list-title">{thread.label}</span>
              </button>
            </li>)}
            {!model.threads.length && <li className="orin-brain-more">No threads were published with this digest.</li>}
          </ul>}
        </div>
        <div className="orin-brain-card">
          <FocusDetail node={selectedNode} model={model} onSelect={toggle}/>
          {selectedNode && <button type="button" className="orin-brain-clear" onClick={() => setSelectedId(null)}>Clear focus</button>}
        </div>
      </div>
      <p className="orin-brain-legend" aria-hidden="true">{model.sources.map((source) => <span key={source.id}><i style={{ background: source.color }}/>{source.label} · {source.count}</span>)}</p>
      {model.stats.truncated > 0 && <p className="orin-brain-note orin-brain-truncated">Showing the {model.stats.items} strongest neurons; {model.stats.truncated} more item{model.stats.truncated === 1 ? '' : 's'} stay in the digest list.</p>}
    </>}
  </section>;
}
