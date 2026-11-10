#!/usr/bin/env node
// Clay credit audit: estimate Actions and Data Credits for a table plan,
// find the waste, and price each fix.
//
// Usage:
//   node audit.mjs <plan.json>                  markdown report
//   node audit.mjs <plan.json> --json           machine-readable result
//   node audit.mjs <plan.json> --out fixed.json also write the optimized plan
//
// No dependencies. The same functions are exported for an MCP server.
//
// Pricing facts: Clay pricing page and Clay University docs, read 2026-11-10.
// See ../references/pricing.md for sources and the open questions.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PLANS = {
  free: { label: 'Free', actions: 500, credits: 100, rowsPerTable: 200 },
  launch: { label: 'Launch', actions: 15000, credits: 2500, rowsPerTable: 50000 },
  growth: { label: 'Growth', actions: 40000, credits: 6000, rowsPerTable: 50000 },
  enterprise: { label: 'Enterprise', actions: 200000, credits: 100000, rowsPerTable: null },
};

// Task kinds a formula can do with no Action and no Data Credit.
const FORMULA_TASKS = new Set(['format', 'normalize', 'first_name', 'domain', 'split', 'join', 'lowercase', 'trim']);
// Task kinds a fixed-price model handles well. Test on 20 rows before you switch.
const LIGHT_AI_TASKS = new Set(['classify', 'extract', 'score', 'summarize', 'tag']);
const DEFAULT_LIGHT_MODEL_CREDITS = 0.5; // Gemini 2.5 Flash, content mode (Clay AI pricing doc)

const clone = (o) => JSON.parse(JSON.stringify(o));
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const isPaid = (c) => ['enrichment', 'waterfall', 'ai', 'verify'].includes(c.kind);

// ---------- estimate ----------

function columnCost(col, plan) {
  const rows = plan.rows_per_month;
  let reach = col.pass_rate ?? 1;
  if (plan.lookup_used && isPaid(col)) reach *= 1 - (plan.crm_overlap ?? 0);
  const rerun = plan.auto_run && isPaid(col) ? 1 + (plan.rerun_rate ?? 0) : 1;
  const n = rows * reach * rerun;
  const byok = !!col.byok;

  if (col.kind === 'formula' || col.kind === 'filter' || col.kind === 'lookup') {
    return { actions: 0, credits: 0, hit: 1 };
  }
  if (col.kind === 'export') {
    return { actions: n, credits: 0, hit: 1 };
  }
  if (col.kind === 'ai') {
    return { actions: n, credits: byok ? 0 : n * (col.credits ?? 0), hit: 1 };
  }
  if (col.kind === 'enrichment' || col.kind === 'verify') {
    const hit = col.hit_rate ?? 1;
    const charged = col.refund_on_miss ? hit : 1;
    return { actions: n * charged, credits: byok ? 0 : n * charged * (col.credits ?? 0), hit };
  }
  if (col.kind === 'waterfall') {
    let p = 1;
    let actions = 0;
    let credits = 0;
    for (const s of col.steps) {
      const hit = s.hit_rate ?? 0;
      const charged = col.refund_on_miss ? hit : 1;
      actions += n * p * charged;
      credits += s.byok ? 0 : n * p * charged * (s.credits ?? 0);
      p *= 1 - hit;
    }
    return { actions, credits, hit: 1 - p };
  }
  throw new Error(`Column "${col.name ?? col.id}": unknown kind "${col.kind}"`);
}

export function estimate(plan) {
  validate(plan);
  const columns = plan.columns.map((c) => {
    const cost = columnCost(c, plan);
    return { id: c.id, name: c.name ?? c.id, kind: c.kind, actions: cost.actions, credits: cost.credits, hit: cost.hit };
  });
  const actions = columns.reduce((a, c) => a + c.actions, 0);
  const credits = columns.reduce((a, c) => a + c.credits, 0);
  const rows = plan.rows_per_month;
  return { rows, actions, credits, perRow: { actions: actions / rows, credits: credits / rows }, columns };
}

function validate(plan) {
  if (!plan || !Array.isArray(plan.columns)) throw new Error('Plan needs a "columns" array.');
  if (!(plan.rows_per_month > 0)) throw new Error('Plan needs "rows_per_month" greater than 0.');
  if (plan.plan && !PLANS[plan.plan]) throw new Error(`Unknown plan "${plan.plan}". Use free, launch, growth or enterprise.`);
  const ids = new Set();
  for (const c of plan.columns) {
    if (!c.id) throw new Error('Every column needs an "id".');
    if (ids.has(c.id)) throw new Error(`Duplicate column id "${c.id}".`);
    ids.add(c.id);
    if (c.kind === 'waterfall' && !(c.steps?.length)) throw new Error(`Waterfall "${c.id}" needs "steps".`);
  }
}

// ---------- rules ----------
// Each rule returns zero or more findings. A finding with `fix` changes a copy
// of the plan, so its saving is measured, not guessed. A finding without `fix`
// is advice the numbers cannot price.

const RULES = [
  function waterfallOrder(plan) {
    const out = [];
    for (const col of plan.columns) {
      if (col.kind !== 'waterfall' || col.steps.length < 2) continue;
      // Exchange argument: with refunds on a miss, cheapest first wins.
      // Charged per attempt, sort by credits / hit rate.
      const key = (s) => (col.refund_on_miss ? s.credits : s.credits / Math.max(s.hit_rate, 1e-6));
      const best = [...col.steps].sort((a, b) => key(a) - key(b));
      const same = best.every((s, i) => s.provider === col.steps[i].provider);
      if (same) continue;
      out.push({
        rule: 'waterfall-order',
        column: col.id,
        title: `Reorder the "${col.name ?? col.id}" waterfall`,
        detail: `Now: ${col.steps.map((s) => s.provider).join(' > ')}. Cheaper per hit: ${best.map((s) => s.provider).join(' > ')}.`,
        fix: (p) => {
          p.columns.find((c) => c.id === col.id).steps = clone(best);
        },
      });
    }
    return out;
  },

  function noFitGate(plan) {
    // Columns that feed the fit check (role "fit", or feeds_fit: true) must run
    // on every row. Every other paid column can wait for the fit result.
    const fit = plan.columns.find((c) => c.role === 'fit');
    const rate = plan.fit_pass_rate;
    const open = plan.columns.filter(
      (c) => isPaid(c) && c.role !== 'fit' && !c.feeds_fit && !c.only_if && (c.pass_rate ?? 1) >= 1,
    );
    if (!open.length) return [];
    const names = open.map((c) => `"${c.name ?? c.id}"`).join(', ');
    if (rate == null) {
      return [{
        rule: 'no-fit-gate',
        title: 'Paid columns run on every row',
        detail: `${names} run before any fit check. Add a fit filter and set "fit_pass_rate" to price the saving.`,
      }];
    }
    const late = fit && open.some((c) => plan.columns.indexOf(c) < plan.columns.indexOf(fit));
    return [{
      rule: 'no-fit-gate',
      columns: open.map((c) => c.id),
      title: 'Enrich only the rows that fit',
      detail: `${round((1 - rate) * 100, 0)}% of rows fail the fit check, and ${names} still run on them.${late ? ' Move the fit column before them.' : ''}${fit?.kind === 'ai' ? ' If headcount, industry and country decide fit, a formula does the check for free.' : ''}`,
      fix: (p) => {
        for (const c of p.columns) {
          if (!open.some((o) => o.id === c.id)) continue;
          c.only_if = fit ? `${fit.id} passes` : 'fit passes';
          c.pass_rate = rate;
        }
      },
    }];
  },

  function autoRun(plan) {
    if (!plan.auto_run || !(plan.rerun_rate > 0)) return [];
    return [{
      rule: 'auto-run',
      title: 'Stop auto-run from enriching the same rows again',
      detail: `About ${round(plan.rerun_rate * 100, 0)}% of rows run again after an edit or refresh. Turn off auto-run on paid columns, or add "only if this column is empty" to each.`,
      fix: (p) => {
        p.rerun_rate = 0;
      },
    }];
  },

  function aiForFormula(plan) {
    return plan.columns
      .filter((c) => c.kind === 'ai' && FORMULA_TASKS.has(c.task))
      .map((col) => ({
        rule: 'ai-for-formula',
        column: col.id,
        title: `Replace the AI in "${col.name ?? col.id}" with a formula`,
        detail: `"${col.task}" is a fixed rule. A formula does it for 0 Actions and 0 Data Credits.`,
        fix: (p) => {
          const c = p.columns.find((x) => x.id === col.id);
          c.kind = 'formula';
          delete c.credits;
        },
      }));
  },

  function heavyModel(plan) {
    return plan.columns
      .filter((c) => c.kind === 'ai' && !c.byok && LIGHT_AI_TASKS.has(c.task) && (c.credits ?? 0) > DEFAULT_LIGHT_MODEL_CREDITS)
      .map((col) => ({
        rule: 'heavy-model',
        column: col.id,
        title: `Use a fixed-price model for "${col.name ?? col.id}"`,
        detail: `"${col.task}" at ${col.credits} credits a run. A fixed-price model costs about ${DEFAULT_LIGHT_MODEL_CREDITS}. Compare both on 20 rows before you switch.`,
        fix: (p) => {
          p.columns.find((x) => x.id === col.id).credits = DEFAULT_LIGHT_MODEL_CREDITS;
        },
      }));
  },

  function duplicateLookups(plan) {
    const out = [];
    const seen = new Map();
    for (const col of plan.columns) {
      if (col.kind !== 'enrichment' || !col.category) continue;
      const first = seen.get(col.category);
      if (!first) {
        seen.set(col.category, col);
        continue;
      }
      out.push({
        rule: 'duplicate-lookup',
        column: col.id,
        title: `Merge "${first.name ?? first.id}" and "${col.name ?? col.id}" into one waterfall`,
        detail: `Both look up "${col.category}" on every row. In a waterfall the second runs only when the first finds nothing.`,
        fix: (p) => {
          const a = p.columns.find((x) => x.id === first.id);
          const b = p.columns.find((x) => x.id === col.id);
          if (!a || !b) return;
          const step = (c) => ({ provider: c.provider ?? c.name ?? c.id, credits: c.credits ?? 0, hit_rate: c.hit_rate ?? 1, byok: !!c.byok });
          Object.assign(a, {
            kind: 'waterfall',
            refund_on_miss: !!(a.refund_on_miss && b.refund_on_miss),
            steps: [step(a), step(b)],
          });
          p.columns = p.columns.filter((x) => x.id !== b.id);
        },
      });
    }
    return out;
  },

  function verifyEverything(plan) {
    const out = [];
    for (const [i, col] of plan.columns.entries()) {
      if (col.kind !== 'verify' || col.only_if || (col.pass_rate ?? 1) < 1) continue;
      const source = plan.columns.slice(0, i).find((c) => c.category === 'email' && (c.kind === 'waterfall' || c.kind === 'enrichment'));
      if (!source) continue;
      out.push({
        rule: 'verify-everything',
        column: col.id,
        title: `Verify only rows that have an email`,
        detail: `"${col.name ?? col.id}" also runs on rows where "${source.name ?? source.id}" found nothing.`,
        fix: (p) => {
          const est = estimate(p).columns.find((c) => c.id === source.id);
          const c = p.columns.find((x) => x.id === col.id);
          const src = p.columns.find((x) => x.id === source.id);
          if (!est || !src) return;
          c.only_if = `${source.id} is not empty`;
          c.pass_rate = (src.pass_rate ?? 1) * est.hit;
        },
      });
    }
    return out;
  },

  function crmLookup(plan) {
    if (!(plan.crm_overlap > 0) || plan.lookup_used) return [];
    return [{
      rule: 'crm-lookup',
      title: 'Check the CRM before you enrich',
      detail: `About ${round(plan.crm_overlap * 100, 0)}% of rows are already in the CRM. A lookup step (no Action) skips them.`,
      fix: (p) => {
        p.lookup_used = true;
      },
    }];
  },

  function ownKeys(plan) {
    return plan.columns
      .filter((c) => c.own_key_available && !c.byok && (c.credits ?? 0) > 0)
      .map((col) => ({
        rule: 'own-key',
        column: col.id,
        title: `Use your own API key in "${col.name ?? col.id}"`,
        detail: 'With your key the run costs 1 Action and 0 Data Credits. The provider bills you directly, so compare that price first.',
        fix: (p) => {
          p.columns.find((x) => x.id === col.id).byok = true;
        },
      }));
  },
];

// ---------- audit ----------

export function audit(plan) {
  const base = estimate(plan);
  const findings = [];
  for (const rule of RULES) {
    for (const f of rule(plan)) {
      let saving = null;
      if (f.fix) {
        const p = clone(plan);
        f.fix(p);
        const after = estimate(p);
        saving = { actions: base.actions - after.actions, credits: base.credits - after.credits };
      }
      findings.push({ ...f, saving });
    }
  }

  // Apply every fix in rule order. Savings overlap, so the total is measured
  // on the combined plan, not summed.
  let optimized = clone(plan);
  for (const rule of RULES) {
    for (const f of rule(optimized)) if (f.fix) f.fix(optimized);
  }
  const after = estimate(optimized);

  findings.sort((a, b) => (b.saving?.credits ?? -1) - (a.saving?.credits ?? -1) || (b.saving?.actions ?? -1) - (a.saving?.actions ?? -1));
  const tier = PLANS[plan.plan ?? 'launch'];
  return {
    table: plan.table ?? 'Untitled table',
    plan: plan.plan ?? 'launch',
    before: base,
    after,
    fit: tier && {
      label: tier.label,
      before: { actions: base.actions / tier.actions, credits: base.credits / tier.credits },
      after: { actions: after.actions / tier.actions, credits: after.credits / tier.credits },
      rowsOverLimit: tier.rowsPerTable != null && plan.rows_per_month > tier.rowsPerTable,
    },
    findings: findings.map(({ fix, ...f }) => f),
    optimized,
  };
}

// ---------- report ----------

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const pct = (n) => `${Math.round(n * 100)}%`;

export function report(r) {
  const L = [];
  const cut = r.before.credits ? 1 - r.after.credits / r.before.credits : 0;
  L.push(`# Clay credit audit: ${r.table}`);
  L.push('');
  L.push(`${fmt(r.before.rows)} rows a month on the ${r.fit?.label ?? r.plan} plan.`);
  L.push('');
  L.push('| | Data Credits / month | Actions / month | Credits per row |');
  L.push('|---|---:|---:|---:|');
  L.push(`| Now | ${fmt(r.before.credits)} | ${fmt(r.before.actions)} | ${round(r.before.perRow.credits, 2)} |`);
  L.push(`| After fixes | ${fmt(r.after.credits)} | ${fmt(r.after.actions)} | ${round(r.after.perRow.credits, 2)} |`);
  L.push('');
  L.push(`Data Credits drop by ${pct(cut)}.`);
  if (r.fit) {
    L.push('');
    L.push(`Plan use now: ${pct(r.fit.before.credits)} of Data Credits, ${pct(r.fit.before.actions)} of Actions. After: ${pct(r.fit.after.credits)} and ${pct(r.fit.after.actions)}.`);
    if (r.fit.before.credits > 1 || r.fit.before.actions > 1) L.push('The table goes over the plan now. Data Credit top-ups cost 30% more, and Actions cannot be topped up.');
    if (r.fit.rowsOverLimit) L.push(`The row count is over the ${r.fit.label} limit for one table.`);
  }
  L.push('');
  L.push('## Fixes, largest saving first');
  L.push('');
  if (!r.findings.length) L.push('No waste found in this plan.');
  r.findings.forEach((f, i) => {
    const s = f.saving ? ` (saves ${fmt(f.saving.credits)} credits, ${fmt(f.saving.actions)} actions a month)` : ' (not priced)';
    L.push(`${i + 1}. **${f.title}**${s}`);
    L.push(`   ${f.detail}`);
  });
  L.push('');
  L.push('## Where the credits go now');
  L.push('');
  L.push('| Column | Kind | Data Credits | Actions |');
  L.push('|---|---|---:|---:|');
  for (const c of [...r.before.columns].sort((a, b) => b.credits - a.credits)) {
    L.push(`| ${c.name} | ${c.kind} | ${fmt(c.credits)} | ${fmt(c.actions)} |`);
  }
  L.push('');
  L.push('Estimates use the costs and hit rates in the plan file. Check each cost in the Clay enrichment panel, and test changes on 20 rows before a full run.');
  return L.join('\n');
}

// ---------- cli ----------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: node audit.mjs <plan.json> [--json] [--out optimized.json]');
    process.exit(2);
  }
  try {
    const plan = JSON.parse(readFileSync(file, 'utf8'));
    const r = audit(plan);
    const outIdx = args.indexOf('--out');
    if (outIdx !== -1 && args[outIdx + 1]) writeFileSync(args[outIdx + 1], JSON.stringify(r.optimized, null, 2) + '\n');
    console.log(args.includes('--json') ? JSON.stringify(r, null, 2) : report(r));
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}
