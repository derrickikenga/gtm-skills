# GTM skills

Claude skills for go-to-market systems, by [Derrick Ikenga](https://derrickikenga.com). Each skill does one GTM job inside Claude. All skills are free and MIT licensed.

| Skill | What it does |
|---|---|
| [clay-credit-audit](plugins/clay-credit-audit/skills/clay-credit-audit/SKILL.md) | Finds the Data Credits and Actions that a Clay table wastes, and gives the saving for each fix. |

## Install

### Claude Code

```bash
/plugin marketplace add derrickikenga/gtm-skills
```

```bash
/plugin install clay-credit-audit@gtm-skills
```

### Other agents (skills CLI)

```bash
npx skills add derrickikenga/gtm-skills
```

### Claude.ai and Claude Desktop

1. Download the `clay-credit-audit` folder as a zip file.
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

## Test

```bash
node --test plugins/clay-credit-audit/skills/clay-credit-audit/scripts/audit.test.mjs
```

## License

MIT
