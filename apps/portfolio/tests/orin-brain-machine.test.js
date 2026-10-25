import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrainModel, layoutBrain } from '../src/components/orin/brainGraph.js';
import { buildBrainMachine } from '../src/components/orin/brainMachine.js';

const items = Array.from({ length: 18 }, (_, index) => ({
  id: String(index).padStart(64, '0'),
  source: ['arxiv', 'rss', 'reddit'][index % 3],
  title: `Signal ${index}`,
  url: `https://example.test/${index}`,
  topics: index % 4 === 0 ? ['ROCm kernels'] : index % 3 === 0 ? ['Agents'] : ['GPU kernels'],
  ranking: { score: 95 - index },
  saved: index === 2,
  read: index === 4,
}));

const model = buildBrainModel({ items });
const view = layoutBrain(model);

test('the signal board groups action neurons into two-lane topic trays', () => {
  assert.equal(view.blocks.length, model.topics.length);
  assert.ok(view.blocks.every((block) => block.itemCount > 0));
  for (const block of view.blocks) {
    const topic = view.nodes.find((node) => node.id === block.topicId);
    const actions = view.nodes.filter((node) => node.kind === 'item' && node.topicIds[0] === block.topicId);
    assert.equal(actions.length, block.itemCount);
    assert.equal(topic.y, (block.top + block.bottom) / 2);
    assert.ok(actions.every((node) => node.y >= block.top && node.y <= block.bottom));
    assert.ok(actions.every((node) => node.lane === 0 || node.lane === 1));
  }
});

test('Anatomy geometry is deterministic, solid and tied to the graph model', () => {
  const machine = buildBrainMachine(view);
  assert.deepEqual(buildBrainMachine(view), machine);
  assert.equal(machine.nodes.length, view.nodes.length);
  assert.equal(machine.links.length, view.links.length);
  assert.equal(machine.trays.length, view.blocks.length);
  assert.ok(machine.nodes.every((node) => node.parts.length >= 3));
  assert.ok(machine.nodes.every((node) => Number.isFinite(node.topY) && node.topY < node.y));
  assert.ok(machine.nodes.filter((node) => node.kind === 'source').every((node) => node.parts.length === 3));
  assert.ok(machine.nodes.filter((node) => node.kind === 'item').every((node) => node.parts.length === 3));
  assert.ok(machine.nodes.some((node) => node.kind === 'topic' && node.parts.length > 3));
  assert.ok(!JSON.stringify(machine).includes('NaN'));
  for (const node of machine.nodes) {
    for (const entry of node.parts) {
      assert.ok(entry.paths.fill.length > 0);
      assert.ok(entry.paths.top.length > 0);
      assert.ok(entry.paths.outline.length > 0);
    }
  }
});
