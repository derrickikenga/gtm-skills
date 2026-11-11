---
name: agent-audit
description: Audit what a GTM agent produced, row by row. Find the rows it got wrong, then decide for each step whether to keep the agent, replace it with a rule or formula, or put a person in front of it, plus a plan to monitor it. Use when someone asks if their AI column, Claygent, n8n agent or AI SDR is accurate, says an agent qualifies or scores leads badly, asks whether to use AI or a formula, wants human-in-the-loop for outbound, or wants to check AI-written emails before they send. Works from a CSV export; it does not log in to any tool.
---

# Agent audit

An agent ran for a while: it enriched, classified, scored or wrote emails. This skill finds the rows it got wrong and decides what each step needs:

- **keep the agent**, and monitor it
- **replace it with a rule**, because a formula gives the same answer for free, every time
- **add a human review gate**, because the step sends or writes outside your systems and makes mistakes

Code finds the suspect rows. A person decides what is right. The script counts.

## Workflow

1. **Get the rows and the steps.** Read `references/intake.md`. You need:
   - a CSV of what the agent produced, with its inputs
   - for each AI step: the prompt, the column it wrote, and whether it sends or writes outside (email, CRM)
2. **Write `steps.json`.** Format: `references/steps-format.md`. Start from `examples/clay-hr-fit/steps.json` or `examples/outbound-drafts/steps.json`.
   - For each classify step, write one candidate rule: the formula a person would write from the instruction, with only the columns in the table.
   - ⛔ Write the rule from the definition, never from the agent's answers. A rule tuned to the agent copies its mistakes.
3. **Run the check.**
   ```bash
   node scripts/audit.mjs check rows.csv steps.json --out review.csv
   ```
   The review sheet holds every flagged row, plus a random sample of clean rows (20 by default, `--sample`). The sample shows the errors the checks cannot see.
4. **Review.** A person sets `verdict` to `right`, `wrong` or `unsure` on each row. When a row is wrong, they put the right answer in `correct_value`.
   - If the user asks you to review, read each row's input and decide. Write "reviewed by Claude" in `note`.
   - Then say in the report that a person did not review it.
   - ⛔ Never fill a verdict you cannot support from the row's own data.
5. **Score and report.**
   ```bash
   node scripts/audit.mjs score review.csv steps.json --rows rows.csv
   ```
   - Lead with the table: each step, its error rate and its decision.
   - Then, for each step: why, the rows that were wrong and what they had in common, and the plan to monitor it.
   - Read `references/decisions.md` before you add advice the script does not give.

## Rules

- **Every error rate comes from reviewed rows.** Under 30 reviewed rows, say "direction, not measurement".
- **A flag is not an error.** A rule can be wrong too. Only the verdict column counts.
- **Never send, post or write anything during the audit.** Drafts stay drafts.
- **Keep personal data local.** Rows can hold names and emails. Do not paste them into other tools or reports.
- **Say when the agent did well.** A short report that says "keep it" is a good result.
