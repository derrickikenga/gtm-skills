# Intake: get the table into a plan file

Clay has no public API that returns a table's columns or its credit log. So the audit works from what the user gives you. Ask for the fastest option they can do.

## Option 1: screenshots (fastest)

Ask for:

1. The full table view, scrolled so every column header shows.
2. The settings panel of each paid column (enrichment, waterfall, AI). The panel shows the provider, the cost per run and the "only run if" condition.
3. Settings, then Usage, for the last 30 days: the **Integrations** tab (credits and Actions per provider) and the **Workbooks** tab (per table). These are what Clay charged. The cost in the enrichment panel is an estimate and can be far off: in one test it showed about 28.5 credits for a column that cost 1.

## Option 2: the user describes it

Ask these questions, one group at a time:

- How many rows go through the table each month? Which plan are you on?
- List the columns from left to right. For each paid one: the provider, the cost per run, and any "only run if" condition.
- For each waterfall: the providers in order. What share of rows does each one fill?
- Is auto-run on? About how often do rows run again?
- What share of rows is already in your CRM?
- What share of rows match your ICP? What decides fit?

## Option 3: a CSV export

A CSV export costs no Action. Empty cells per column give the hit rates. It does not show costs or conditions, so pair it with option 1 or 2.

## Defaults when a number is missing

Mark each one as an assumption in the report.

| Missing | Use |
|---|---|
| hit rate of a finder | the share of filled cells in the export, or ask |
| rerun_rate | 0, and note that auto-run can add more |
| crm_overlap | 0, and ask the question in the report |
| fit_pass_rate | leave it out; the audit then flags the gap without a price |
