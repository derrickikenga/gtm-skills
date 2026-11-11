# Decisions: agent, rule or person

The script makes one decision per step. Use this page to explain it, and to add what the script cannot see.

## Replace with a rule

The script decides this when a candidate rule matches or beats the agent on reviewed rows, and is right on 90% or more of them.

- A rule costs no AI run, no token and, in Clay, no Action. It gives the same answer every time.
- A rule only works when the answer is in a field you already have. If the answer needs a web search or judgment, the rule fails, and the score shows it.
- After the switch, keep the agent for the rows the rule cannot decide. Examples: an empty description, or a borderline row the reviewer marked unsure.

Example from `examples/clay-hr-fit`:
- The first AI prompt said Yes to 10 of 15 companies, and 5 were wrong.
- A stricter prompt fixed the answers, but cost 2 credits and 15 Actions.
- A keyword formula on the description got the reviewed rows right for 0.

## Add a human review gate

The script decides this when the step writes outside your systems and its error rate is above the line (2% by default).

- A person approves each row before it goes out.
- Log what the person changes. The edits are the next training set, and they show which errors repeat.
- Lower the gate later, step by step: first the rows the checks pass, then a sample.

## Fix the agent, then re-check

The script decides this for an internal step with an error rate above the line.

- Group the wrong rows. Most errors share one cause: a vague definition, a missing input or a field the agent does not read.
- Put two wrong rows and their right answers into the prompt as examples.
- Check the model. A cheaper model with a strict prompt often beats an expensive one with a loose prompt.
- Run the check and a new review. Do not reuse the old verdicts.

## Keep the agent, and monitor it

- Run the check on every row before it is used. The checks cost nothing.
- Review a random sample each week: 20 rows when the error rate is 2% or less, 40 above that.
- Run the audit again when the prompt, the model or the input data changes.

## Signs the script does not measure

- **Drift:** the positive rate moves week to week with no business reason.
- **Cost:** an expensive model on a simple step. In Clay, compare the real charge in Settings, then Usage.
- **Confidence:** if the agent gives a confidence score, check whether wrong rows have lower scores. If they do, gate only the low ones.
