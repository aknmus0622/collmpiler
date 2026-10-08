# library-ts: from a rough spec to verified code

The loan of one book at a library. This example was made with `clp` alone, starting from a spec that was rough
on purpose, to show how a spec becomes precise: not by writing the interpretation, but by reading what `clp
interpret` reports and making Layer 1 (`specs/loan.component.ts`) say more.

```text
specs/loan.component.ts        Layer 1: written by a person
specs/loan.decisions.ts        Layer 1: the library's numbers
specs/loan.interpretation.ts   Layer 2: derived by an LLM, accepted by a person
src/                           production code, written by an agent
clp/                           the test side, generated
```

```bash
pnpm exec clp verify --out .     # run from this directory
```

## How the spec got here

Every command below was run from this directory, with
`--agent 'claude -p "Read clp/REQUEST.md and carry out the request." --permission-mode acceptEdits'`.

### 1. A rough start

The first version gave the states, and everything else as prose:

```ts
queries: description("How many books the member currently has on loan, and whether someone else has reserved the book."),
effects: description("A due-date notice to the member, a late-fee charge, a notice to the next member waiting, and a replacement charge."),
commands: {
  Borrow: description("A member can borrow an available book unless they already have too many books. The member is told the due date."),
  // ...
  Return: description("A book on loan or overdue can be returned. A late return is charged the late fee. If someone is waiting for the book, they are notified."),
},
```

`clp compile` and `clp apply` refuse to go on at this point, and say why:
`このコンポーネントの解釈 (interpretation) がありません。clp interpret で導いて、確定してください`.

### 2. `clp interpret`, first report: 11 questions, 1 disagreement

The interpretation passed its checks, and came with what the LLM could not know:

```text
Layer 1 does not say how many books are "too many"; 5 is assumed
Layer 1 does not say how long "a long time" is; more than 30 days past the due date is assumed
Layer 1 states neither the amount of the late fee nor whether it grows with the days late
Layer 1 names no clock, so the due date is remembered as a number of days counted down by DayPasses
"past its due date" is read as strictly after it: a book returned on the due day itself is not late
...
```

Each of these is a decision the spec had left to chance. They were made in Layer 1:

- the numbers went into a decision table (`specs/loan.decisions.ts`: 3 books, 14 days, 100 yen per day up to
  1,000, lost after 30 days). Values in a table reach the code without passing through the interpretation;
- the late fee became a calculation, described in a sentence;
- the prose now says there is no clock, what each effect carries, and what "past its due date" means.

### 3. Second report: 2 questions, 1 disagreement

`clp interpret` updated the interpretation — it reported which parts changed and left the other six alone. What
remained:

```text
nothing limits how many times a loan can be extended
食い違い (Borrow、実行できるかどうか): Borrow {"booksOnLoan":0,"reservedBySomeoneElse":true}
  1つ目: {"state":"ON_LOAN", ...}      2 つ目: {"skipped":true}
```

The second interpretation read "an available book" as "not reserved by someone else"; the first did not. The
spec had not said. Layer 1 now does (a reserved book cannot be borrowed; a loan can be extended any number of
times).

### 4. Third report: pin it down as structure — and get it wrong first

Only `Borrow` changed. The disagreement that was left was about form: is a borrowing that is not allowed
*not possible*, or *possible, with nothing happening*? Prose could not settle that, so `Borrow` was written as
parts. The first choice was a precondition:

```ts
Borrow: compose(
  from("AVAILABLE"),
  onlyIf("The member holds fewer books than the policy's maximum", "Nobody else has reserved the book"),
  goTo("ON_LOAN"),
  does("The book is due in the policy's loan days. The member is told the due date."),
),
```

The interpretation was accepted and `clp apply` was run. It passed only on the sixth implementation attempt,
after a restart from design. The mutation gate kept rejecting the code:

```text
Changing 3 (line 26) does not make the tests fail, so this value is not actually decided by production code.
```

It was right. A precondition (`onlyIf`) puts a situation outside the specification: what happens there is not
tested, so a check of the limit in production code is dead as far as the tests can tell. The agent finally
passed by **removing the check**: the code no longer looked at the limit at all. That is what the spec had
asked for, and not what was meant.

### 5. A refusal is an outcome

The limit is something the code must decide, so it has to be inside what is verified:

```ts
Borrow: compose(
  from("AVAILABLE"),
  when(
    "The member already holds at least the policy's maximum number of books, or someone else has reserved the book",
    does("The borrowing is refused; nothing changes."),
  ),
  otherwise(goTo("ON_LOAN"), does("The book is due in the policy's loan days. The member is told the due date.")),
),
```

`clp verify` refused to run at this point (the interpretation no longer fitted Layer 1), `clp interpret` updated
it, and the report pointed at one more loose word: "holds the maximum number" had been read by the second
interpretation as "exactly that many". The sentence now says "at least".

### 6. Accept, apply, verify

```bash
pnpm exec clp interpret --accept
pnpm exec clp apply --out . --agent '...'
pnpm exec clp verify --out .
```

Because production code already existed, `clp apply` first graded it against the new spec (it failed: a member
with three books could still borrow) and then ran the implementation step alone.

A note on the disagreements: the second interpretation is asked to take the less obvious reading wherever it
can, so each run reports something, and some of it contradicts a sentence that is explicit. Whether a reading
is one the prose allows is for the author to judge; "no disagreements" is not the goal.

## What this shows

- The questions (`// REVIEW:`) carried most of the information; the disagreements pointed at the two places
  where the spec could really be read two ways.
- Numbers belong in a decision table, not in prose and not in the interpretation.
- When prose cannot settle a point, write that point as structure. Nothing else has to become structure.
- Since then, `clp` checks for this before any agent runs: it changes each value of a decision table and looks
  whether anything the spec expects changes. With the precondition version of `Borrow` it now stops at once:
  `決定表 policy の行 "otherwise" の maxBooks (3): この値を変えても、変わるのは「コマンドを実行できるかどうか」だけです…`.
- Use `onlyIf` only for what cannot happen. What the code must refuse is an outcome (`when`), or it is not
  verified — and the mutation gate will push the check out of the code.
- Nobody wrote `loan.interpretation.ts` by hand at any point.
