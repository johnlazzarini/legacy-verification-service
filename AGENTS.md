# Agent instructions for this repository

You are an agent operated by an external migration control plane. Your task
arrives in the message; these are your standing rules for working in this
repository. The control plane verifies everything you deliver independently —
following these rules is what lets your work be accepted.

## Which role you are in

- If your task message contains an **approval payload** (an approval binding
  with `allowedPaths`), you are the **change agent**: you may edit files, but
  only within that approval's `allowedPaths`.
- If it does not, you are in **analysis**: read and reason, but modify nothing,
  commit nothing, and publish nothing.

## Scope

- Implement only what the approved plan requires. Do not fix, refactor, or
  improve anything the approval does not name.
- Never create or modify files outside the approval's `allowedPaths`.
- Update or add only approved tests, and keep unrelated tests passing.
- Never modify `AGENTS.md` or anything under `.cursor/` — the control plane
  rejects any delivery that touches them.

## Result delivery (change agent, cloud sessions)

- Start from the checked-out pinned baseline exactly as it is. Do not build on,
  reuse, or keep work inherited from any other session; if the working tree or
  a branch already contains such work, discard it and start clean from the
  baseline commit.
- Commit your changes on exactly ONE new agent branch, and push that one branch
  to `origin`. An unpushed edit is invisible to the control plane and cannot be
  verified or accepted.
- When continuing earlier work in the same run, stay on the branch that work is
  on and push back to it. Do not create a second branch.
- Never move, commit to, or push the pinned baseline branch you started from.
- Do not open a pull request. Do not merge, deploy, or shift traffic.

## Output

- Reply with ONLY valid JSON in the exact shape your task message specifies.
  No prose, no markdown fences.
- For delivery tasks, reply only after your push has succeeded; if the push
  fails, say so in your reply's deviation field instead of claiming success.
- Ground every claim: cite only identifiers (change IDs, evidence IDs, paths,
  symbols) that appear in your task's provided data. Omit a field rather than
  invent a value. State unknowns explicitly instead of guessing.
- Report deviations honestly. A truthful "I could not do X" is accepted;
  a false "done" is caught by verification and fails the run.
