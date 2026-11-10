# Waste patterns

The script prices the first group. Check the second group by hand and add what applies.

## Priced by the script

| Rule | What is wrong | Fix in Clay |
|---|---|---|
| `no-fit-gate` | Paid columns run on rows that do not match the ICP | Put a fit check first. Add "only run if fit = true" to each paid column |
| `waterfall-order` | An expensive provider runs first | Put the cheapest cost per hit first |
| `auto-run` | Edits and refreshes run paid columns again | Turn off auto-run, or add "only run if this column is empty" |
| `crm-lookup` | Rows already in the CRM get enriched again | Look up the CRM first (no Action) and skip matches |
| `duplicate-lookup` | Two columns find the same thing on every row | Merge them into one waterfall |
| `ai-for-formula` | AI does a fixed rule (first name, domain, format) | Use a formula |
| `heavy-model` | A variable model does a light task | Use a fixed-price model, after a 20-row comparison |
| `verify-everything` | The verifier runs on rows with no email | Add "only run if email is not empty" |
| `own-key` | The user has a provider key but pays in credits | Connect the key (1 Action, 0 credits) |

## Check by hand

- **Phone on every fit row.** Phones cost the most. Limit them to the top tier of accounts, or to rows after a reply.
- **Full run before a test.** Did the user run a new column on the whole table? Next time, 20 rows first.
- **Claygent for structured data.** If a provider returns the same field, it is cheaper and more consistent than an AI web search.
- **Stale re-enrichment.** Re-running a whole table each month. Re-run only rows older than a set age.
- **Copied tables.** The same list enriched in two tables. Use Lookup Single Row from the first table.
- **Exports of every row.** Sending non-fit rows to the CRM costs an Action each and fills the CRM with noise.
- **Plan size.** If the fixed table fits a lower plan, say so. If it goes over, compare the next plan with top-ups at 30% extra.
