# Intake: get the rows

## The rows

Get one CSV. Each row is one record the agent worked on. It holds the inputs the agent saw and the outputs it wrote.

| Tool | How to get the CSV |
|---|---|
| Clay | Table menu, then Export, then CSV. A CSV export costs no Action. |
| n8n | Write the run data to a Google Sheet or a data table, then download it as CSV. You can also use the execution data of a run. |
| A spreadsheet | File, then Download, then CSV. |
| An AI SDR tool | Export the prospects with the drafted messages. |

Ask for all the rows from one period, not only the rows the user remembers as bad. The random sample needs the clean rows too.

## The steps

For each AI step, ask:

1. Which column did it write?
2. What was the prompt? Paste it.
3. Which columns did it read?
4. Does the output leave your systems? That means an email that sends, a CRM write, or a message to a customer.
5. What is a wrong answer here? Ask for one example.

## Defaults

| Missing | Use |
|---|---|
| `allowed` values for a classify step | the distinct values in the column, then ask the user to confirm them |
| `writes` | `internal`, and ask the question in the report |
| a candidate rule | none, and say in the report that no rule was tested |
| `max_error` | 5% for internal steps, 2% for steps that write outside |
