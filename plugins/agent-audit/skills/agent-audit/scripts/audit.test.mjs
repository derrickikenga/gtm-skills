import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCsv, toCsv, check, score } from './audit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ex = (...p) => join(here, '..', 'examples', ...p);
const load = (dir) => ({
  rows: parseCsv(readFileSync(ex(dir, 'rows.csv'), 'utf8')),
  steps: JSON.parse(readFileSync(ex(dir, 'steps.json'), 'utf8')),
  review: parseCsv(readFileSync(ex(dir, 'review-filled.csv'), 'utf8')),
});

test('csv: quotes, commas, newlines and doubled quotes survive a round trip', () => {
  const rows = [{ a: 'x, y', b: 'line one\nline two', c: 'say "hi"' }];
  assert.deepEqual(parseCsv(toCsv(rows, ['a', 'b', 'c'])), rows);
});

test('classify: out-of-set values, refusals and rule disagreements are flagged', () => {
  const rows = [
    { d: 'recruiting software', y: 'Yes' },
    { d: 'a bakery', y: 'Maybe' },
    { d: 'a law firm', y: "I'm sorry, I could not find this company" },
    { d: 'hiring platform', y: 'No' },
  ];
  const steps = { steps: [{ column: 'y', kind: 'classify', inputs: ['d'], allowed: ['Yes', 'No'], rules: [{ name: 'kw', regex: '/recruit|hiring/i' }] }] };
  const [s] = check(rows, steps, { sample: 0 }).steps;
  const why = Object.fromEntries(s.flagged.map(f => [f.index, f.flags.join(' | ')]));
  assert.equal(why[0], undefined);
  assert.match(why[1], /not one of Yes, No/);
  assert.match(why[2], /refusal/);
  assert.match(why[3], /rule "kw" says Yes/);
});

test('extract: a value that is not in the inputs is flagged as not grounded', () => {
  const rows = [
    { page: 'Contact Jane Doe, VP Sales', name: 'Jane Doe' },
    { page: 'Contact Jane Doe, VP Sales', name: 'John Smith' },
  ];
  const steps = { steps: [{ column: 'name', kind: 'extract', inputs: ['page'] }] };
  const [s] = check(rows, steps, { sample: 0 }).steps;
  assert.deepEqual(s.flagged.map(f => f.index), [1]);
});

test('consistency: the same input with two different answers is flagged', () => {
  const rows = [{ d: 'same text', y: 'Yes' }, { d: 'same text', y: 'No' }];
  const [s] = check(rows, { steps: [{ column: 'y', kind: 'classify', inputs: ['d'] }] }, { sample: 0 }).steps;
  assert.match(s.flagged[0].flags[0], /same input as row 2/);
});

test('drafts: the planted mistakes in the outbound example are all caught', () => {
  const { rows, steps } = load('outbound-drafts');
  const [s] = check(rows, steps, { sample: 0 }).steps;
  const why = Object.fromEntries(s.flagged.map(f => [f.row, f.flags.join(' | ')]));
  assert.match(why['3'], /placeholder/);
  assert.match(why['4'], /banned phrase/);
  assert.match(why['5'], /number not in the inputs: 63%/);
  assert.match(why['6'], /does not mention company/);
  assert.match(why['2'], /same template as row 7/);
  assert.equal(why['1'], undefined);
});

test('drafts that send externally with errors get a human review gate', () => {
  const { rows, steps, review } = load('outbound-drafts');
  const [s] = score(review, steps, { draft_email: rows.length });
  assert.equal(s.decision, 'add a human review gate');
  assert.equal(s.flagged.wrong + s.sampled.wrong, 4);
});

test('live Clay test: the rule flags exactly the companies the first prompt got wrong', () => {
  const { rows, steps } = load('clay-hr-fit');
  const [loose, strict] = check(rows, steps, { sample: 0 }).steps;
  assert.deepEqual(loose.flagged.map(f => f.row), ['BigRio', 'ArtStation', 'Artmac', 'Soul AI', 'Notchup']);
  assert.equal(loose.counts.Yes, 10);
  assert.deepEqual(strict.flagged.map(f => f.row), ['Notchup']);
});

test('live Clay test: after review, the fit check should become a rule', () => {
  const { rows, steps, review } = load('clay-hr-fit');
  const [loose] = score(review, steps, { fit_ai: rows.length, fit_ai_strict: rows.length });
  assert.equal(loose.decision, 'replace with a rule');
  assert.equal(loose.agent_right, 10);
  assert.equal(loose.rules[0].right, 14);
  assert.equal(Math.round(loose.estimated_error_rate * 100), 27);
});

test('score before any review asks for the review', () => {
  const steps = { steps: [{ column: 'y', kind: 'classify' }] };
  const [s] = score([{ step: 'y', row: '2', why: 'random sample of clean rows', verdict: '', agent_output: 'Yes' }], steps);
  assert.equal(s.decision, 'review first');
});

test('bad steps file is refused with a clear message', () => {
  assert.throws(() => check([], { steps: [{ column: 'x', kind: 'guess' }] }), /kind must be one of/);
  assert.throws(() => check([], {}), /non-empty "steps"/);
});
