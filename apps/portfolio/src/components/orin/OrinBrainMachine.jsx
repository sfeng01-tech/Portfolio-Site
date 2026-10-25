import React, { useMemo } from 'react';
import { buildBrainMachine } from './brainMachine';
import { layoutBrain, shortLabel } from './brainGraph';
import { Dots, Line, Solid } from './anatomy/draw';
import './anatomy/iso.css';
import './OrinBrainMachine.css';

const LABEL_LIMIT = 18;

function MachineNeuron({ node, color, active, dimmed, onSelect }) {
  const className = [
    'orin-brain-node', `is-${node.kind}`, active ? 'is-active' : '', dimmed ? 'is-dimmed' : '',
    node.read ? 'is-read' : '', node.saved ? 'is-saved' : '',
  ].filter(Boolean).join(' ');
  const caption = node.kind === 'item'
    ? shortLabel(node.label, LABEL_LIMIT)
    : node.kind === 'source' ? `${node.caption || node.label} · ${node.count}` : node.label;
  const label = node.kind === 'topic' ? 'Topic segment' : node.kind === 'source' ? 'Source neuron' : 'Action neuron';
  return <g className={className} role="button" tabIndex={0} aria-pressed={active}
    aria-label={`${label}: ${node.label}`} style={{ '--neuron-color': color }}
    onClick={() => onSelect(node)} onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node); }
    }}>
    <title>{node.kind === 'item' ? node.label : caption}</title>
    <circle className="orin-brain-hit" cx={node.x} cy={(node.y + node.topY) / 2} r={node.r + 7}/>
    {node.parts.map((entry, index) => <Solid key={index} {...entry} lit={active}/>)}
    {node.rings.map((d, index) => <Line key={index} d={d} tone={active ? 'lit' : 'lo'} className="orin-brain-ring"/>)}
    {node.kind !== 'item' && <text className={`orin-brain-node-label${node.kind === 'topic' ? ' is-strong' : ''}`}
      x={node.kind === 'source' ? node.x - node.r - 12 : node.x + node.r + 12} y={node.topY + 3.5}
      textAnchor={node.kind === 'source' ? 'end' : 'start'}>{caption}</text>}
  </g>;
}

function Part({ entry, lit = false }) {
  return <Solid {...entry} lit={lit}/>;
}

export default function OrinBrainMachine({ model, focus, selectedId, onSelect, onClear }) {
  const view = useMemo(() => layoutBrain(model), [model]);
  const machine = useMemo(() => buildBrainMachine(view), [view]);
  const sourcesById = useMemo(() => new Map(model.sources.map((node) => [node.id, node])), [model.sources]);
  const itemsById = useMemo(() => new Map(model.items.map((node) => [node.id, node])), [model.items]);
  const selected = selectedId ? machine.nodes.find((node) => node.id === selectedId) : null;
  const flowColor = (link) => {
    const sourceId = link.kind === 'source-topic' ? link.from : itemsById.get(link.to)?.sourceId;
    return sourcesById.get(sourceId)?.color || 'var(--accent)';
  };

  return <figure className="orin-brain-machine iso iso-figure" onKeyDown={(event) => { if (event.key === 'Escape') onClear(); }}>
    <div className="iso-plate">
      <div className="iso-plate-corners" aria-hidden="true">
        <span className="iso-plate-corner" data-corner="fig">ORIN · FIG 01</span>
        <span className="iso-plate-corner" data-corner="title">Neural signal router</span>
        <span className="iso-plate-corner" data-corner="hint">Select a neuron to trace</span>
        <span className="iso-plate-corner" data-corner="readout" data-readout="">
          {selected ? shortLabel(selected.label, 34) : `${model.stats.links} paths · ${model.stats.saved} saved`}
        </span>
      </div>
      <div className="orin-brain-machine-viewport">
      <svg className="orin-brain-machine-map iso-svg" viewBox={`0 0 ${machine.width} ${machine.height}`} role="group"
        aria-label={`Isometric neural patchbay: ${model.stats.sources} sources feeding ${model.stats.segments} topic segments across ${model.stats.items} action neurons`}
        onClick={(event) => { if (!event.target.closest('.orin-brain-node')) onClear(); }}>
        <g aria-hidden="true">
          <path className="iso-halo" d={machine.base.fill}/>
          {machine.feet.map((parts, index) => <g key={index}>{parts.map((entry, partIndex) => <Part key={partIndex} entry={entry}/>)}</g>)}
          <Part entry={{ paths: machine.base, tone: 'mid', crease: 'faint' }}/>
          <Line d={machine.groove} tone="lo"/>
          {machine.channels.map((d, index) => <Line key={index} d={d} tone="faint"/>)}
          {machine.screwRings.map((entry, index) => <Part key={index} entry={entry}/>)}
          <Dots points={machine.screwPoints} size={0.5}/>
          <Part entry={{ paths: machine.ruler.strip, tone: 'lo', crease: 'none' }}/>
          {machine.ruler.minorSegments.map((d, index) => <Line key={`minor-${index}`} d={d} tone="lo"/>)}
          {machine.ruler.majorSegments.map((d, index) => <Line key={`major-${index}`} d={d} tone="mid"/>)}
        </g>
        <g aria-hidden="true">
          {machine.trays.map((tray) => <g key={tray.topicId} className={focus && !focus.has(tray.topicId) ? 'is-dimmed' : ''}>
            <Part entry={tray.solid}/>
            <Line d={tray.outline} tone="faint"/>
            <Dots points={tray.points} size={0.45} tone="mid"/>
          </g>)}
        </g>
        <g className="orin-brain-links" aria-hidden="true">
          {machine.links.map((link, index) => <g key={link.id} className={!focus || focus.has(link.from) || focus.has(link.to) ? '' : 'is-dimmed'}>
            <path className={`orin-brain-link is-${link.kind}`} d={link.d} style={{ strokeWidth: Math.min(2.4, 0.8 + link.weight * 0.35) }}/>
            <path className="orin-brain-flow" d={link.d} pathLength={1}
              style={{ '--flow-color': flowColor(link), '--flow-duration': `${2.4 + (index % 7) * 0.42}s`, '--flow-delay': `${-(index * 0.19)}s` }}/>
          </g>)}
        </g>
        <g className="orin-brain-nodes">
          {machine.nodes.map((node) => <MachineNeuron key={node.id} node={node}
            color={node.kind === 'source' ? node.color : sourcesById.get(node.sourceId)?.color || 'var(--accent)'}
            active={selectedId === node.id} dimmed={Boolean(focus) && !focus.has(node.id)} onSelect={onSelect}/>)}
        </g>
      </svg>
      </div>
    </div>
    <figcaption className="orin-brain-machine-caption">
      <p className="orin-brain-axis" aria-hidden="true"><span>input jacks / sources</span><span>relays / similar topics</span><span>lamps / actions</span></p>
    </figcaption>
  </figure>;
}
