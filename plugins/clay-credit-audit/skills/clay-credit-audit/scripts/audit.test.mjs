// node --test scripts/audit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate, audit } from './audit.mjs';

const base = { rows_per_month: 100, plan: 'launch', columns: [] };

test('formula costs nothing', () => {
  const r = estimate({ ...base, columns: [{ id: 'f', kind: 'formula' }] });
  assert.equal(r.actions, 0);
  assert.equal(r.credits, 0);
});

test('waterfall step runs only on earlier misses, charged per attempt', () => {
  const r = estimate({ ...base, columns: [{ id: 'w', kind: 'waterfall', steps: [
    { provider: 'A', credits: 2, hit_rate: 0.5 },
    { provider: 'B', credits: 1, hit_rate: 0.5 },
  ] }] });
  assert.equal(r.actions, 150); // 100 + 50
  assert.equal(r.credits, 250); // 200 + 50
});

test('refund on miss charges hits only', () => {
  const r = estimate({ ...base, columns: [{ id: 'e', kind: 'enrichment', credits: 2, hit_rate: 0.3, refund_on_miss: true }] });
  assert.equal(r.actions, 30);
  assert.equal(r.credits, 60);
});

test('own key costs Actions but no Data Credits', () => {
  const r = estimate({ ...base, columns: [{ id: 'e', kind: 'enrichment', credits: 5, byok: true }] });
  assert.equal(r.actions, 100);
  assert.equal(r.credits, 0);
});

test('reorder puts cheaper per hit first and saves credits', () => {
  const r = audit({ ...base, columns: [{ id: 'w', kind: 'waterfall', steps: [
    { provider: 'Pricey', credits: 4, hit_rate: 0.5 },
    { provider: 'Cheap', credits: 1, hit_rate: 0.5 },
  ] }] });
  const f = r.findings.find((x) => x.rule === 'waterfall-order');
  assert.ok(f);
  assert.equal(r.optimized.columns[0].steps[0].provider, 'Cheap');
  assert.ok(f.saving.credits > 0);
});

test('fit gate skips columns that feed the fit check', () => {
  const r = audit({ ...base, fit_pass_rate: 0.5, columns: [
    { id: 'co', kind: 'enrichment', credits: 1, feeds_fit: true },
    { id: 'fit', kind: 'formula', role: 'fit' },
    { id: 'em', kind: 'enrichment', credits: 2 },
  ] });
  const f = r.findings.find((x) => x.rule === 'no-fit-gate');
  assert.deepEqual(f.columns, ['em']);
  assert.equal(f.saving.credits, 100);
});

test('bad input fails with a clear message', () => {
  assert.throws(() => estimate({ columns: [] }), /rows_per_month/);
});
