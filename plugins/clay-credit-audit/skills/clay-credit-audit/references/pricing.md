# Clay pricing facts

Read on 2026-11-10. Clay changes pricing often. Check the sources before you quote a number to a user.

`[C]` = Clay's own page. `[3P]` = third party. `[?]` = not confirmed.

## Plans [C]

Source: https://www.clay.com/pricing

| Plan | Price (monthly / annual, per month) | Actions a month | Data Credits a month | Rows per table |
|---|---|---:|---:|---|
| Free | $0 | 500 | 100 | 200 |
| Launch | $185 / $167 | 15,000 | 2,500 | 50,000 |
| Growth | $495 / $446 | 40,000 | 6,000 | 50,000 `[3P]` |
| Enterprise | custom, annual | 200,000+ | 100,000+ | more than 50,000 |

- Phone enrichment: Launch and above.
- Your own API keys: all plans.
- HTTP API, webhooks and CRM auto-sync: Growth and above.

## What costs an Action [C]

Source: https://university.clay.com/docs/actions-data-credits

- 1 Action per record for each enrichment, from any provider, including your own API key.
- 1 Action per AI run.
- 1 Action per record for signals, CRM and warehouse exports and syncs, and HTTP API calls.
- 1 Action per lead added to the Clay sequencer.
- **No Action:** sourcing lists, CRM and warehouse imports, webhook imports, formulas and filters, Sculptor, Send Table Data, Lookup Single Row, CSV export.

## What costs Data Credits [C]

- Marketplace data, unless the data is free or you use your own API key.
- Clay-managed AI. Per-model costs: https://university.clay.com/docs/ai-pricing. Fixed-price models (for example GPT-5 Mini at 0.4 for content and 1 for research, Gemini 2.5 Flash at 0.5 and 1) cost less than variable models (for example o3 at about 5, Claude 4.6 Opus at about 7.5). Variable runs hold credits at the 75th percentile and refund the rest.
- Clay's own estimate for a fully enriched record: 6 to 20 Data Credits.
- The cost of each option shows next to it in the enrichment panel. Use the panel for a provider's list price per run. For what a column really cost, read Settings > Usage (see the live test below).

## Misses and refunds

- The pricing FAQ says an enrichment with no result costs nothing. `[C]`
- The refund doc is narrower: only listed actions (mostly email, phone and company finders) refund on `No data`. `Empty response` never refunds. `Error`, `Timed out` and `Invalid input` refund in most cases. A verifier that returns `invalid` is charged. `[C]` https://university.clay.com/docs/credit-refunds
- **The audit uses the refund doc.** Set `refund_on_miss: true` only for columns on that list.

## Auto-run [C] and [seen in app]

- Clay's FAQ says automatic refreshes trigger enrichments and tells users to turn auto-run off when not needed.
- Seen in the app on 2026-11-10: auto-run has a **Keep existing results** option. When it is on, cells that already have data do not run again; only errored, empty or new cells run. Clay turns it on for **new** tables. Older tables can still have it off, so ask.
- `[?]` Whether each edit to a row fires a charged re-run with the option off is not documented. Use the user's run history for `rerun_rate`.

## Waterfalls [?]

- The audit assumes a waterfall stops at the first provider that returns a value. No Clay page read on 2026-11-10 states it outright. Confirm in the table's run history.
- The audit treats hit rates as independent. Real providers overlap, so the reorder saving is an estimate.

## What the app showed in a live test [seen in app, 2026-11-10]

A 15-row table on the Free plan. Full record: `../examples/live-test-2026-11-10.json`.

- **The panel estimate is a hold, not the bill.** A Claygent column with the Auto model showed "~1.9 / row" (about 28.5 for 15 rows). Clay charged 1 credit for all 15. It still charged 15 Actions.
- **The estimate ignores run conditions.** An enrichment limited to 5 rows still showed "~7.5 total" for 15. Clay charged for 5.
- **Read real spend in Settings > Usage.** The Integrations tab shows credits and Actions per integration; the Workbooks tab shows them per table. Use these numbers in the plan file, not panel estimates. The page shows whole credits, so 7.5 shows as 8.
- **Reuse saved data from Audiences (Beta).** Enrichment columns have an option to reuse data saved in the last 30 days. Clay says it can save credits. It is off by default.
- On the Free plan, AI columns on cheap models spend Actions (500 a month) faster than Data Credits.

## Rollover and top-ups [C]

- Actions do not roll over.
- Data Credits on monthly Launch and Growth roll over up to 2x the monthly amount. Annual plans roll over 15% if renewed at the same tier or higher.
- One-time top-ups cost 30% more (50% on legacy plans), minimum 250 credits. Actions cannot be bought as top-ups.
- Top-ups cap at 4x the monthly allocation, $1,000 each and $5,000 in any 7 days.

## Clay's own advice for lower usage [C]

Use your own keys. Filter before you enrich. Enrich only empty, stale or low-confidence fields. Test on 10 to 20 rows. Turn off auto-run when not needed. Pause AI columns that add nothing. Prefer fixed-price AI models. Watch Settings, then Usage.
