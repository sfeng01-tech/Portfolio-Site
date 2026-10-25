import React, { useState } from 'react';

// Owner-facing category taxonomy manager. Unused labels delete directly; when a
// label still carries items the owner chooses its fate per row: unfile them
// (they fall back to topics and the model may re-file them) or map all of them
// onto another label as one owner decision.
export default function OrinCategoryManager({ categories, onAction }) {
  const [pending, setPending] = useState(null);
  const [targets, setTargets] = useState({});

  const act = (label, action, to) => {
    if (pending) return;
    setPending(label);
    Promise.resolve(onAction(label, action, to)).finally(() => setPending(null));
  };

  const otherLabels = (label) => categories.map(category => category.label).filter(candidate => candidate !== label);
  const labelCount = label => categories.find(category => category.label === label)?.items ?? 0;

  return <details className="orin-category-manage">
    <summary>Categories {categories.length}</summary>
    <ul>
      {categories.map(({ label, items }) => {
        const others = otherLabels(label);
        return <li key={label}>
          <span className="orin-category-manage-label">{label}{items ? <em> · {items}</em> : ''}</span>
          {pending === label ? <em className="orin-category-manage-working">working…</em> : items === 0
            ? <button onClick={() => act(label)}>Delete</button>
            : <>
              <button disabled={Boolean(pending)} onClick={() => act(label, 'unfile')} title="Clear this label from every item; they fall back to their topics and the model may re-file them">Unfile {items}</button>
              <button disabled={Boolean(pending) || !others.length} onClick={() => act(label, 'reassign', targets[label] || others[0])} title="Move every item onto another label as one owner decision">Reassign →</button>
              <select aria-label={`Reassign ${label} to`} disabled={!others.length}
                value={targets[label] || others[0] || ''}
                onChange={event => setTargets(previous => ({ ...previous, [label]: event.target.value }))}>
                {others.map(candidate => <option key={candidate} value={candidate}>{candidate}</option>)}
              </select>
            </>}
        </li>;
      })}
    </ul>
  </details>;
}
