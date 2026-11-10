---
name: clay-credit-audit
description: Audit a Clay table for wasted Data Credits and Actions, then price each fix. Use when someone says their Clay credits run out too fast, asks why a table costs so much, wants to cut Clay spend, plans a new Clay table and wants a cost estimate, or asks which Clay plan they need. Works from a description, screenshots or an export of the table; it does not need a Clay login.
---

# Clay credit audit

Find where a Clay table spends its Data Credits and Actions, and show the cheaper version of the same table with the saving for each change.

## How Clay bills (2026 model)

- **Actions:** 1 per record for every enrichment, AI run, export, CRM sync and HTTP call, from any provider, including runs on your own API key. Formulas, filters, imports, Lookup Single Row and CSV export cost no Action. Actions reset each month and cannot be topped up.
- **Data Credits:** paid for marketplace data and Clay-managed AI. Your own API key costs 0 Data Credits (still 1 Action).
- Full facts, sources and open questions: `references/pricing.md`. Read it before you quote a price or a rule.

## Workflow

1. **Get the table.** Use `references/intake.md`. You need: rows a month, plan, each column in order with its kind, cost per run, hit rate and run condition, plus auto-run, CRM overlap and the share of rows that fit the ICP. Ask only for what is missing. When the user does not know a hit rate, use their Clay run history; if there is none, say which numbers are assumptions.
2. **Write the plan file.** Format in `references/plan-format.md`. Start from `examples/outbound-table.json`. Never guess a provider's credit cost: take it from the user, a screenshot of the Clay enrichment panel, or mark it as an assumption.
3. **Run the audit.**
   ```bash
   node scripts/audit.mjs plan.json --out optimized.json
   ```
   Add `--json` for a machine-readable result.
4. **Check the findings against the real table.** The script prices what it can measure. Read `references/waste-patterns.md` for the checks it cannot price, and add the ones that apply.
5. **Report.** Lead with the before and after table and the percent cut. Then the fixes, largest saving first, each with the exact change to make in Clay. Name every assumption. End with: test each change on 20 rows before a full run.

## Rules

- A number in the report comes from the script, the user, or Clay's own pages. Never invent a provider price or a hit rate.
- Say "estimate" for anything built on assumed hit rates.
- Do not tell the user to scrape, rotate proxies or get around a provider's terms to save credits.
- If a fix trades data quality for cost (a cheaper email provider with more bounces), say so next to the saving.
- If the table is cheap already, say that. A short report is a good result.
