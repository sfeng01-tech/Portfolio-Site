import test from 'node:test';
import assert from 'node:assert/strict';
import { reasoningOptions } from './summarize.mjs';

test('mandatory reasoning uses the lowest advertised effort without disabling it', () => {
  assert.deepEqual(reasoningOptions({ reasoning: { mandatory: true, supported_efforts: ['max', 'high', 'low'] } }), { exclude: true, effort: 'low' });
  assert.deepEqual(reasoningOptions({ reasoning: { mandatory: true } }), { exclude: true, enabled: true });
  assert.deepEqual(reasoningOptions({ reasoning: { mandatory: false } }), { enabled: false });
  assert.equal(reasoningOptions({}), undefined);
});
