import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  parseJSFile,
  stringifyJSFile
} from '../src/utils/jsParser.js';

test('parses the current portfolio module without damaging URLs or template literals', async () => {
  const source = await readFile(
    new URL('../src/data/portfolioData.js', import.meta.url),
    'utf8'
  );
  const data = parseJSFile(source);

  assert.equal(data.profile.linkedin, 'https://linkedin.com/in/sahil-faizal');
  const onnxPost = data.blogPosts.find(
    (post) => post.slug === 'onnx-and-onnx-runtime-practitioners-guide'
  );
  assert.ok(onnxPost);
  assert.equal(
    onnxPost.externalUrl,
    'https://sahilfaizal.substack.com/p/onnx-and-onnx-runtime-practitioners'
  );
});

test('round-trips Unicode and JavaScript-like text safely', async () => {
  const source = await readFile(
    new URL('../src/data/portfolioData.js', import.meta.url),
    'utf8'
  );
  const data = parseJSFile(source);
  data.profile.tagline = 'Unicode ✓ — backtick ` and ${notExecutable}';

  const serialized = stringifyJSFile(data);
  const reparsed = parseJSFile(serialized);

  assert.equal(reparsed.profile.tagline, data.profile.tagline);
});
