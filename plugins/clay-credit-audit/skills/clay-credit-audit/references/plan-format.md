# Plan file format

One JSON file describes one table. Example: `../examples/outbound-table.json`.

## Table fields

| Field | Type | Meaning |
|---|---|---|
| `table` | string | Name for the report |
| `plan` | `free`, `launch`, `growth`, `enterprise` | Clay plan. Default `launch` |
| `rows_per_month` | number | Rows that go through the table each month |
| `auto_run` | boolean | Auto-run on for paid columns |
| `rerun_rate` | 0 to 1 | Share of rows that run again in a month because of auto-run |
| `crm_overlap` | 0 to 1 | Share of rows already in the CRM |
| `lookup_used` | boolean | A lookup skips rows already in the CRM |
| `fit_pass_rate` | 0 to 1 | Share of rows that match the ICP |
| `columns` | array | Columns, left to right |

## Column fields

| Field | Used by | Meaning |
|---|---|---|
| `id` | all | Unique short id |
| `name` | all | Name in Clay |
| `kind` | all | `enrichment`, `waterfall`, `ai`, `verify`, `export`, `formula`, `filter`, `lookup` |
| `category` | enrichment, waterfall | What it finds: `email`, `phone`, `company`, `person` |
| `credits` | enrichment, ai, verify | Data Credits per run, from the Clay panel |
| `hit_rate` | enrichment, verify | Share of runs that return a value |
| `refund_on_miss` | enrichment, waterfall | `true` only if Clay's refund doc lists this action |
| `steps` | waterfall | `[{ provider, credits, hit_rate, byok }]` in run order |
| `task` | ai | `classify`, `extract`, `score`, `summarize`, `tag`, `research`, or a formula task: `format`, `normalize`, `first_name`, `domain`, `split` |
| `role` | any | `fit` marks the column that decides ICP fit |
| `feeds_fit` | any | `true` if the fit check needs this column, so it must run on every row |
| `only_if` | any paid | The run condition, if one exists |
| `pass_rate` | any paid | Share of rows that pass `only_if`. Default 1 |
| `byok` | paid | Runs on the user's own API key |
| `own_key_available` | paid | The user has a key for this provider but does not use it |

## What the script computes

For each column: rows reached = rows a month x `pass_rate`, less CRM overlap when `lookup_used`, plus `rerun_rate` when `auto_run`.

- Enrichment: Actions = rows reached (x hit rate if refunded on a miss). Data Credits = Actions x credits. Own key: 0 credits.
- Waterfall: each step runs only on rows the earlier steps missed.
- AI: 1 Action and `credits` per row reached.
- Export: 1 Action per row reached.
- Formula, filter, lookup: nothing.
