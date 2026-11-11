# GTM skills

Claude skills for go-to-market systems, by [Derrick Ikenga](https://derrickikenga.com). Each skill does one GTM job inside Claude. All skills are free and MIT licensed.

| Skill | What it does |
|---|---|
| [clay-credit-audit](plugins/clay-credit-audit/skills/clay-credit-audit/SKILL.md) | Finds the Data Credits and Actions that a Clay table wastes, and gives the saving for each fix. |
| [agent-audit](plugins/agent-audit/skills/agent-audit/SKILL.md) | Finds the rows a GTM agent got wrong. For each step, it decides: keep the agent, replace it with a rule, or put a person in front of it. |

## Install

### Claude Code

```bash
/plugin marketplace add derrickikenga/gtm-skills
```

```bash
/plugin install clay-credit-audit@gtm-skills
/plugin install agent-audit@gtm-skills
```

### Other agents (skills CLI)

```bash
npx skills add derrickikenga/gtm-skills
```

### Claude.ai and Claude Desktop

1. Download the skill folder (`clay-credit-audit` or `agent-audit`) as a zip file.
2. Open Settings, then Capabilities, then Skills.
3. Upload the zip file.

## clay-credit-audit

Tell Claude about your Clay table, or send screenshots of it. Claude writes a plan file and runs the audit. The audit does not need a Clay login, and it spends no credits.

You can also run the calculator yourself:

```bash
node plugins/clay-credit-audit/skills/clay-credit-audit/scripts/audit.mjs plan.json
```

Live test on a real Clay table (15 companies, Free plan, 2026-11-10). The numbers are what Clay charged:

| | Data Credits | Actions |
|---|---:|---:|
| Table A: AI fit check, then enrich every row | 9 | 30 |
| Table B: formula fit check, then enrich only rows that fit | 2 | 5 |

The calculator gave the same numbers before the run. The record is in `examples/live-test-2026-11-10.json`.

The audit finds these problems:

- An AI fit check where a formula can decide.
- Paid columns that run on rows that do not match the ICP.
- Waterfalls with an expensive provider first.
- Auto-run that enriches the same rows again.
- Rows that are already in the CRM.
- Two columns that find the same data.
- AI that does a task a formula can do.
- Expensive AI models on simple tasks.
- Email verification on rows with no email.
- Paid credits where you have your own API key.

The price facts come from the Clay website. Each fact has a source and a date in [pricing.md](plugins/clay-credit-audit/skills/clay-credit-audit/references/pricing.md). Clay changes its prices often. If a fact is wrong, open an issue.

## agent-audit

An agent ran on your rows: it classified, scored, enriched or wrote emails. Export the rows as CSV, and tell Claude what each AI step was asked to do. The audit has three steps:

1. **check:** fixed rules run over every row and flag the suspect rows. A review sheet holds those rows and a random sample of the clean rows.
2. **review:** a person marks each row in the sheet as right, wrong or unsure.
3. **score:** for each step, the audit gives the error rate and a decision:
   - keep the agent, and monitor it
   - replace it with a rule
   - add a human review gate

```bash
node plugins/agent-audit/skills/agent-audit/scripts/audit.mjs check rows.csv steps.json --out review.csv
node plugins/agent-audit/skills/agent-audit/scripts/audit.mjs score review.csv steps.json --rows rows.csv
```

Live test on the same Clay table (`examples/clay-hr-fit`). The AI column had to answer one question: does the company sell HR, hiring or recruiting software?

| Fit check | Said Yes | Wrong | Decision |
|---|---:|---:|---|
| First AI prompt | 10 | 4, plus 1 unsure | replace with a rule |
| Stricter AI prompt (2 credits, 15 Actions) | 6 | 0, plus 1 unsure | replace with a rule |
| Keyword formula (0 credits, 0 Actions) | 5 | 0 | |

The check flagged exactly the 5 rows that the first prompt got wrong or unsure. Claude did the review from the company descriptions, not a person. The descriptions in the example are short paraphrases, so the repo does not copy Clay's data.

`examples/outbound-drafts` is made-up data with planted mistakes:
- a merge field left as `{{first_name}}`
- an invented "63%"
- a banned opener
- an email that does not name the company

The check catches each one. Drafts that send with errors get a human review gate.

## Test

```bash
node --test plugins/*/skills/*/scripts/*.test.mjs
```

## License

MIT
