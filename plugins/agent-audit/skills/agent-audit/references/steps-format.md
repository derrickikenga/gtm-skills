# steps.json format

```json
{
  "id_column": "company",
  "steps": [ { "column": "fit_ai", "kind": "classify", "inputs": ["description"] } ]
}
```

`id_column` is optional. Without it, rows are named by their spreadsheet row number (the header is row 1).

## Fields for every step

| Field | Required | Meaning |
|---|---|---|
| `column` | yes | the column the agent wrote |
| `kind` | yes | `classify`, `extract`, `score` or `draft` |
| `inputs` | no | the columns the agent read. The checks compare the output with these. |
| `instruction` | no | the prompt, kept for the report |
| `writes` | no | `external` if the output sends or writes outside your systems. Otherwise `internal`. |
| `max_error` | no | the highest error rate you accept. Defaults: 0.05 internal, 0.02 external. |

## By kind

| Kind | Fields | What the check flags |
|---|---|---|
| `classify` | `allowed` (list), `positive`, `expected_rate` (`{low, high}`), `rules` | values outside `allowed`, rows where a rule disagrees, and a positive rate outside the expected range |
| `extract` | `pattern` (regex), `grounded` (default true) | values that do not match the pattern, and values not found in the input columns |
| `score` | `min`, `max` | values that are not numbers or are out of range, and every row with the same score |
| `draft` | `must_mention` (a column), `min_words`, `max_words`, `banned` (list), `allowed_numbers` (list) | placeholders left in, banned phrases, wrong length, the company not named, numbers not in the inputs, and the same template sent to many rows |

All kinds also flag:
- empty outputs
- refusal and "not found" text
- the same input with two different answers

## Rules

```json
{ "name": "keyword formula", "regex": "/(recruit|hiring|\\bHR\\b)/i", "when_match": "Yes", "otherwise": "No", "fields": ["description"] }
```

- `fields` defaults to the step's `inputs`.
- `when_match` defaults to `Yes`, and `otherwise` defaults to `No`.
- A rule is a candidate. `score` keeps it only if it beats or matches the agent on reviewed rows, and is right on 90% or more of them.
