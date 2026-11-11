#!/usr/bin/env node
// agent-audit: check what a GTM agent produced, row by row.
//
//   node audit.mjs check <rows.csv> <steps.json> [--out review.csv] [--sample 20] [--seed 1] [--json]
//   node audit.mjs score <review.csv> <steps.json> [--json]
//
// "check" runs fixed rules over every row and writes a review sheet: every flagged row plus a
// random sample of clean rows. A person fills in the verdict column. "score" reads that sheet and
// says, per step, whether to keep the agent, replace it with a rule, or put a person in front of it.
// Zero dependencies. Node 18 or later.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---------- CSV ----------

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const clean = rows.filter(r => r.some(v => v.trim() !== ''));
  if (!clean.length) return [];
  const head = clean[0].map(h => h.trim().replace(/^﻿/, ''));
  return clean.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function toCsv(rows, columns) {
  const esc = v => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map(r => columns.map(c => esc(r[c])).join(','))].join('\n') + '\n';
}

// ---------- helpers ----------

const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}@.]+/gu, ' ').trim();

const REFUSAL = /\b(i'?m sorry|as an ai|i (?:can(?:no|')t|cannot|am unable|was unable|could not|couldn'?t) (?:find|determine|access|verify)|unable to (?:find|determine|access)|no (?:information|data) (?:found|available)|not enough information|n\/a)\b/i;
const PLACEHOLDER = /\{\{[^}]*\}\}|\[(?:first ?name|name|company|company name|title|your name|insert[^\]]*)\]|<(?:first ?name|name|company)>|\bXXX\b|\bTODO\b/i;
const DEFAULT_BANNED = [
  'i hope this email finds you well', 'i hope this finds you well', 'circle back', 'touch base',
  'synergy', 'leverage', 'best-in-class', 'game-changer', 'game changer', 'revolutionize',
  'unlock', 'supercharge', 'just checking in', 'quick question',
];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function sample(arr, n, seed) {
  const r = rng(seed), a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

const pct = x => `${Math.round(x * 100)}%`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function inputText(row, step) {
  return (step.inputs || []).map(f => row[f] ?? '').join(' \n ');
}

function compileRule(rule) {
  const m = /^\/(.*)\/([a-z]*)$/s.exec(rule.regex);
  const re = m ? new RegExp(m[1], m[2]) : new RegExp(rule.regex, 'i');
  return {
    name: rule.name || rule.regex,
    when_match: rule.when_match ?? 'Yes',
    otherwise: rule.otherwise ?? 'No',
    fields: rule.fields,
    apply(row, step) {
      const text = (this.fields || step.inputs || []).map(f => row[f] ?? '').join(' \n ');
      return re.test(text) ? this.when_match : this.otherwise;
    },
  };
}

const same = (a, b) => norm(a) === norm(b);

// ---------- check ----------

const KINDS = ['classify', 'extract', 'score', 'draft'];

export function validateSteps(steps) {
  if (!steps || !Array.isArray(steps.steps) || !steps.steps.length) throw new Error('steps.json needs a non-empty "steps" array');
  for (const s of steps.steps) {
    if (!s.column) throw new Error('every step needs "column": the output column the agent wrote');
    if (!KINDS.includes(s.kind)) throw new Error(`step "${s.column}": kind must be one of ${KINDS.join(', ')}`);
  }
}

export function check(rows, steps, opts = {}) {
  validateSteps(steps);
  const idCol = steps.id_column;
  const results = [];
  for (const step of steps.steps) {
    const rules = (step.rules || []).map(compileRule);
    const flagsByRow = new Map();
    const flag = (i, f) => { if (!flagsByRow.has(i)) flagsByRow.set(i, []); flagsByRow.get(i).push(f); };
    const seenInputs = new Map();
    const counts = {};
    const banned = [...(step.banned ?? DEFAULT_BANNED)].map(b => b.toLowerCase());
    const drafts = new Map();

    rows.forEach((row, i) => {
      const out = row[step.column] ?? '';
      if (!(step.column in row)) throw new Error(`column "${step.column}" is not in the CSV`);
      const src = inputText(row, step);

      if (out.trim() === '') flag(i, 'empty output');
      else if (REFUSAL.test(out)) flag(i, 'refusal or "not found" text');

      if (step.kind === 'classify') {
        const allowed = step.allowed;
        if (allowed && out.trim() !== '' && !allowed.some(a => same(a, out))) flag(i, `value "${out}" is not one of ${allowed.join(', ')}`);
        counts[out] = (counts[out] || 0) + 1;
        for (const r of rules) {
          const want = r.apply(row, step);
          if (!same(want, out)) flag(i, `rule "${r.name}" says ${want}`);
        }
      }

      if (step.kind === 'extract' && out.trim() !== '' && !REFUSAL.test(out)) {
        if (step.pattern && !new RegExp(step.pattern, 'i').test(out)) flag(i, 'does not match the expected format');
        if (step.grounded !== false && step.inputs?.length && !norm(src).includes(norm(out))) flag(i, 'value not found in the input columns');
      }

      if (step.kind === 'score' && out.trim() !== '') {
        const v = Number(out);
        if (!Number.isFinite(v)) flag(i, 'not a number');
        else if ((step.min != null && v < step.min) || (step.max != null && v > step.max)) flag(i, `outside ${step.min}..${step.max}`);
        counts[out] = (counts[out] || 0) + 1;
      }

      if (step.kind === 'draft' && out.trim() !== '') {
        if (PLACEHOLDER.test(out)) flag(i, 'placeholder left in the text');
        const low = out.toLowerCase();
        const hits = banned.filter(b => low.includes(b));
        if (hits.length) flag(i, `banned phrase: ${hits.join(', ')}`);
        const words = out.split(/\s+/).filter(Boolean).length;
        if (step.min_words && words < step.min_words) flag(i, `${words} words, under ${step.min_words}`);
        if (step.max_words && words > step.max_words) flag(i, `${words} words, over ${step.max_words}`);
        if (step.must_mention) {
          const name = row[step.must_mention] ?? '';
          if (name && !norm(out).includes(norm(name))) flag(i, `does not mention ${step.must_mention} "${name}"`);
        }
        const numbers = out.match(/\$?\d[\d,.]*%?[kKmM]?/g) || [];
        const srcNorm = norm(src);
        const unsupported = numbers.filter(n => !srcNorm.includes(norm(n)) && !(step.allowed_numbers || []).includes(n));
        if (unsupported.length && step.inputs?.length) flag(i, `number not in the inputs: ${[...new Set(unsupported)].join(', ')}`);
        // Same text once this row's own input values are taken out: one template sent to everyone.
        let key = norm(out);
        for (const f of step.inputs || []) { const v = norm(row[f]); if (v) key = key.split(v).join(' '); }
        key = key.replace(/\s+/g, ' ').trim();
        drafts.set(key, [...(drafts.get(key) || []), i]);
      }

      if (src.trim()) {
        const key = norm(src);
        if (seenInputs.has(key)) {
          const j = seenInputs.get(key);
          if (step.kind !== 'draft' && !same(rows[j][step.column], out)) {
            flag(i, `same input as row ${rowId(rows[j], j, idCol)} but a different answer`);
          }
        } else seenInputs.set(key, i);
      }
    });

    for (const idxs of drafts.values()) if (idxs.length > 1) idxs.forEach(i => flag(i, `same template as row ${idxs.filter(j => j !== i).map(j => rowId(rows[j], j, idCol)).join(', ')}`));

    const rateNotes = [];
    if (step.kind === 'classify' && step.expected_rate && step.positive) {
      const pos = rows.filter(r => same(r[step.column], step.positive)).length;
      const got = pos / rows.length;
      const { low = 0, high = 1 } = step.expected_rate;
      if (got < low || got > high) rateNotes.push(`${step.positive} on ${pct(got)} of rows, outside the expected ${pct(low)} to ${pct(high)}`);
    }
    if (step.kind === 'score' && Object.keys(counts).length === 1 && rows.length > 5) rateNotes.push('every row got the same score');

    const ruleStats = rules.map(r => {
      const agree = rows.filter(row => same(r.apply(row, step), row[step.column])).length;
      return { name: r.name, agree, of: rows.length };
    });

    const flagged = [...flagsByRow.keys()].sort((a, b) => a - b);
    results.push({
      column: step.column, kind: step.kind, rows: rows.length,
      flagged: flagged.map(i => ({ row: rowId(rows[i], i, idCol), index: i, flags: flagsByRow.get(i) })),
      counts, rules: ruleStats, notes: rateNotes,
    });
  }

  // review sheet: every flagged row per step, plus a random sample of the clean rows
  const n = opts.sample ?? 20;
  const sheet = [];
  results.forEach((res, si) => {
    const step = steps.steps[si];
    const flaggedIdx = new Set(res.flagged.map(f => f.index));
    const clean = rows.map((_, i) => i).filter(i => !flaggedIdx.has(i));
    const picked = sample(clean, Math.min(n, clean.length), (opts.seed ?? 1) + si);
    res.sampled_clean = picked.length;
    res.clean = clean.length;
    const rules = (step.rules || []).map(compileRule);
    const add = (i, why) => sheet.push({
      step: step.column,
      row: rowId(rows[i], i, idCol),
      input: inputText(rows[i], step).replace(/\s+/g, ' ').slice(0, 400),
      agent_output: rows[i][step.column],
      rule_output: rules.map(r => `${r.name}: ${r.apply(rows[i], step)}`).join('; '),
      why,
      verdict: '',
      correct_value: '',
      note: '',
    });
    res.flagged.forEach(f => add(f.index, `flagged: ${f.flags.join('; ')}`));
    picked.sort((a, b) => a - b).forEach(i => add(i, 'random sample of clean rows'));
  });

  return { steps: results, sheet };
}

function rowId(row, i, idCol) {
  return idCol && row[idCol] ? row[idCol] : String(i + 2); // spreadsheet row number, header is row 1
}

// ---------- score ----------

const VERDICT = { right: 'right', correct: 'right', yes: 'right', ok: 'right', wrong: 'wrong', incorrect: 'wrong', no: 'wrong', unsure: 'unsure', '?': 'unsure' };

export function score(review, steps, rowsTotal = {}) {
  validateSteps(steps);
  const out = [];
  for (const step of steps.steps) {
    const mine = review.filter(r => r.step === step.column);
    const v = r => VERDICT[norm(r.verdict)] ?? (r.verdict ? 'unsure' : 'unreviewed');
    const flagged = mine.filter(r => r.why.startsWith('flagged'));
    const sampled = mine.filter(r => !r.why.startsWith('flagged'));
    const tally = list => ({
      right: list.filter(r => v(r) === 'right').length,
      wrong: list.filter(r => v(r) === 'wrong').length,
      unsure: list.filter(r => v(r) === 'unsure').length,
      unreviewed: list.filter(r => v(r) === 'unreviewed').length,
    });
    const tf = tally(flagged), ts = tally(sampled);

    // Estimate the error rate over all rows: errors found in flagged rows count as found; the
    // clean rows get the error rate of their random sample.
    const total = rowsTotal[step.column] ?? (Number(step.rows_total) || null);
    const cleanTotal = total != null ? total - flagged.length : null;
    const sDecided = ts.right + ts.wrong;
    const sRate = sDecided ? ts.wrong / sDecided : 0;
    const [lo, hi] = wilson(ts.wrong, sDecided);
    let est = null, estLo = null, estHi = null;
    if (total) {
      est = (tf.wrong + sRate * cleanTotal) / total;
      estLo = (tf.wrong + lo * cleanTotal) / total;
      estHi = (tf.wrong + Math.min(hi, 1) * cleanTotal) / total;
    }

    // Rule accuracy against the person's verdicts, on reviewed rows with a known right answer.
    const rules = (step.rules || []).map(compileRule);
    const truth = r => {
      if (v(r) === 'right') return r.agent_output;
      if (v(r) === 'wrong') return r.correct_value || null;
      return null;
    };
    const decided = mine.filter(r => truth(r) != null);
    const agentRight = decided.filter(r => same(truth(r), r.agent_output)).length;
    const ruleStats = rules.map(rule => {
      const ruleOut = r => {
        const m = new RegExp(`${rule.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ([^;]*)`).exec(r.rule_output || '');
        return m ? m[1].trim() : null;
      };
      const scored = decided.filter(r => ruleOut(r) != null);
      return { name: rule.name, right: scored.filter(r => same(ruleOut(r), truth(r))).length, of: scored.length };
    });

    // Recommendation
    const reviewedAny = tf.right + tf.wrong + ts.right + ts.wrong > 0;
    const external = step.writes === 'external';
    const threshold = step.max_error ?? (external ? 0.02 : 0.05);
    const best = ruleStats.slice().sort((a, b) => b.right - a.right)[0];
    let decision, why;
    if (!reviewedAny) {
      decision = 'review first';
      why = 'No row has a verdict yet. Fill in the verdict column, then run score again.';
    } else if (best && best.of && best.right >= agentRight && best.right / best.of >= 0.9) {
      decision = 'replace with a rule';
      why = `The rule "${best.name}" was right on ${best.right} of ${best.of} reviewed rows; the agent on ${agentRight} of ${decided.length}. A rule costs nothing to run and gives the same answer every time.`;
    } else if (external && (est == null ? tf.wrong + ts.wrong > 0 : est > threshold)) {
      decision = 'add a human review gate';
      why = `This step sends or writes outside your systems, and the error rate (${est == null ? 'errors found' : `about ${pct(est)}`}) is above the ${pct(threshold)} line. A person approves each one before it goes out.`;
    } else if (est != null && est > threshold) {
      decision = 'fix the agent, then re-check';
      why = `About ${pct(est)} of rows look wrong, above the ${pct(threshold)} line. Tighten the prompt with the wrong rows as examples, then run the audit again.`;
    } else {
      decision = 'keep the agent, and monitor it';
      why = `The error rate is within the ${pct(threshold)} line on the reviewed rows.`;
    }

    const rate = est ?? (sDecided ? sRate : null);
    const monitor = {
      'review first': 'Review the sheet first.',
      'replace with a rule': 'After the switch, check 20 rows by hand once, and again whenever the input data changes.',
      'add a human review gate': 'A person approves every row before it goes out. Log what they change, and run this audit again each month on the edits.',
      'fix the agent, then re-check': 'Run the check and a new review after the fix, before you use this step on more rows.',
      'keep the agent, and monitor it': `Review ${rate != null && rate <= 0.02 ? 20 : 40} random rows a week, and run the check on every row before it is used.`,
    }[decision];
    const reviewedN = tf.right + tf.wrong + ts.right + ts.wrong;
    const smallSample = reviewedN < 30 ? `Only ${plural(reviewedN, 'row')} reviewed. Treat this as a direction, not a measurement.` : null;

    out.push({
      column: step.column, kind: step.kind, writes: step.writes || 'internal',
      flagged: tf, sampled: ts, total, sample_error_rate: sDecided ? sRate : null, sample_ci: sDecided ? [lo, hi] : null,
      estimated_error_rate: est, estimated_ci: est == null ? null : [estLo, estHi],
      agent_right: agentRight, decided: decided.length, rules: ruleStats,
      decision, why, monitor, small_sample: smallSample,
    });
  }
  return out;
}

// ---------- reports ----------

export function checkReport(res) {
  const L = ['# Agent audit: check', ''];
  for (const s of res.steps) {
    L.push(`## ${s.column} (${s.kind})`, '');
    L.push(`${plural(s.rows, 'row')}. ${plural(s.flagged.length, 'row')} flagged. ${s.sampled_clean} of the ${s.clean} clean rows sampled for review.`, '');
    if (Object.keys(s.counts).length && s.kind === 'classify') {
      L.push('Answers: ' + Object.entries(s.counts).map(([k, n]) => `${k || '(empty)'} ${n}`).join(', ') + '.', '');
    }
    for (const r of s.rules) L.push(`Rule "${r.name}" agrees with the agent on ${r.agree} of ${r.of} rows.`);
    if (s.rules.length) L.push('');
    for (const n of s.notes) L.push(`⚠️ ${n}`);
    if (s.notes.length) L.push('');
    if (s.flagged.length) {
      L.push('| Row | Why |', '|---|---|');
      for (const f of s.flagged) L.push(`| ${f.row} | ${f.flags.join('; ')} |`);
      L.push('');
    }
  }
  L.push('Next: open the review sheet. For each row, set verdict to right, wrong or unsure. When it is wrong, put the right answer in correct_value. Then run `score`.');
  return L.join('\n');
}

export function scoreReport(rows) {
  const L = ['# Agent audit: score', ''];
  L.push('| Step | Reviewed | Wrong | Error rate | Decision |', '|---|---:|---:|---:|---|');
  for (const s of rows) {
    const reviewed = s.flagged.right + s.flagged.wrong + s.sampled.right + s.sampled.wrong;
    const wrong = s.flagged.wrong + s.sampled.wrong;
    const er = s.estimated_error_rate == null ? 'n/a' : `~${pct(s.estimated_error_rate)}`;
    L.push(`| ${s.column} | ${reviewed} | ${wrong} | ${er} | ${s.decision} |`);
  }
  L.push('');
  for (const s of rows) {
    L.push(`## ${s.column}`, '', `**${s.decision}.** ${s.why}`, '');
    if (s.estimated_ci) L.push(`Error rate over all ${s.total} rows: about ${pct(s.estimated_error_rate)} (likely between ${pct(s.estimated_ci[0])} and ${pct(s.estimated_ci[1])}).`, '');
    const u = s.flagged.unsure + s.sampled.unsure, n = s.flagged.unreviewed + s.sampled.unreviewed;
    if (u || n) L.push(`${u} unsure and ${n} unreviewed rows are left out of the counts.`, '');
    for (const r of s.rules) L.push(`Rule "${r.name}": right on ${r.right} of ${r.of} reviewed rows. Agent: right on ${s.agent_right} of ${s.decided}.`);
    if (s.rules.length) L.push('');
    if (s.small_sample) L.push(`⚠️ ${s.small_sample}`, '');
    L.push(`Monitor: ${s.monitor}`, '');
  }
  return L.join('\n');
}

// ---------- CLI ----------

function main(argv) {
  const [cmd, a, b, ...rest] = argv;
  const flag = name => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const json = rest.includes('--json');
  if (cmd === 'check' && a && b) {
    const rows = parseCsv(readFileSync(a, 'utf8'));
    const steps = JSON.parse(readFileSync(b, 'utf8'));
    const res = check(rows, steps, { sample: Number(flag('--sample') ?? 20), seed: Number(flag('--seed') ?? 1) });
    const outPath = flag('--out') || 'review.csv';
    writeFileSync(outPath, toCsv(res.sheet, ['step', 'row', 'input', 'agent_output', 'rule_output', 'why', 'verdict', 'correct_value', 'note']));
    if (json) console.log(JSON.stringify({ ...res, sheet: undefined, review_sheet: outPath, rows_total: rows.length }, null, 2));
    else console.log(checkReport(res) + `\n\nReview sheet: ${outPath} (${plural(res.sheet.length, 'row')})`);
    return 0;
  }
  if (cmd === 'score' && a && b) {
    const review = parseCsv(readFileSync(a, 'utf8'));
    const steps = JSON.parse(readFileSync(b, 'utf8'));
    const totals = {};
    const rowsArg = flag('--rows');
    if (rowsArg) { const n = parseCsv(readFileSync(rowsArg, 'utf8')).length; steps.steps.forEach(s => { totals[s.column] = n; }); }
    const res = score(review, steps, totals);
    console.log(json ? JSON.stringify(res, null, 2) : scoreReport(res));
    return 0;
  }
  console.error('usage:\n  node audit.mjs check <rows.csv> <steps.json> [--out review.csv] [--sample 20] [--seed 1] [--json]\n  node audit.mjs score <review.csv> <steps.json> [--rows rows.csv] [--json]');
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error(`agent-audit: ${e.message}`); process.exitCode = 1; }
}
