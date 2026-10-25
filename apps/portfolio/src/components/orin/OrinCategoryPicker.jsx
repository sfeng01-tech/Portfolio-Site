import React, { useState } from 'react';

const NEW_CATEGORY = '__new__';

// Category editing for one artifact. The label (edit/add) follows the taxonomy;
// changing it regroups the brain segments automatically on the next render.
export default function OrinCategoryPicker({ item, categories, disabled, onSetCategory, onCreateCategory }) {
  const current = typeof item.category === 'string' ? item.category : '';
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');

  const change = (value) => {
    if (value === NEW_CATEGORY) { setCreating(true); setDraft(''); return; }
    if (value === '') { if (current) onSetCategory(null); return; }
    if (value !== current) onSetCategory(value);
  };

  return <div className="orin-category">
    <select className="orin-category-select" value={current} disabled={disabled}
      aria-label="Category" title={item.categorySource === 'model' ? 'Assigned by the model' : item.categorySource === 'user' ? 'Set by you' : 'No category yet'}
      onChange={(event) => change(event.target.value)}>
      <option value="">No category</option>
      {current && <option value={current}>{current}</option>}
      {categories.filter(label => label !== current).map(label => <option key={label} value={label}>{label}</option>)}
      <option value={NEW_CATEGORY}>＋ New category…</option>
    </select>
    {creating && <form className="orin-category-form" onSubmit={(event) => {
      event.preventDefault();
      const label = draft.trim();
      if (!label) return;
      onCreateCategory(label).then((resolved) => { setCreating(false); onSetCategory(resolved); }).catch(() => setCreating(false));
    }}>
      <input autoFocus value={draft} maxLength={80} placeholder="Category name" aria-label="New category name"
        onChange={(event) => setDraft(event.target.value)} />
      <button type="submit" disabled={disabled || !draft.trim()} onMouseDown={(event) => event.preventDefault()}>Add</button>
      <button type="button" aria-label="Cancel new category" onMouseDown={(event) => event.preventDefault()} onClick={() => setCreating(false)}>×</button>
    </form>}
  </div>;
}
