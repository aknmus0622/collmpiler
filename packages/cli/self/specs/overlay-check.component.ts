import { commands, effects, input, integer, optional, service, string } from "@clp/core";

// The checks made when an interpretation is laid over Layer 1 (resolveComponent in packages/core/internal.ts, and the
// staleness check of packages/cli/src/loader.ts): Layer 1 always wins, a group Layer 1 lists is closed, outcomes go inside
// cases once a command branches, and so on. Walking the two trees and merging them is not this component's job: it is given
// one fact at a time, and reports the problems each fact shows. The wording is the framework's.
export const Effect = effects({
  Problem: {
    description: "A problem shown by the fact just given.",
    input: input({
      code: ["unknown-key", "conflict", "undescribed", "closed", "flat-in-cases", "layer1-outside-cases", "branch-over-goto", "one-query", "no-part", "key-missing", "key-extra", "stale"],
    }),
  },
});

const Hashes = ["sha256:a", "sha256:b"];
export const KeyInput = input({ known: "boolean" });
export const SlotInput = input({ known: "boolean", layer1: "boolean", interpretation: "boolean" });
export const StateInput = input({ described: "boolean" });
export const EntryInput = input({ listed: "boolean", closed: "boolean", inLayer1: "boolean" });
export const BranchingInput = input({ layer1Cases: "boolean", interpretationCases: "boolean", flat: "boolean", layer1Outcome: "boolean", layer1GoTo: "boolean" });
export const AsksInput = input({ count: integer({ min: 0, max: 3 }) });
export const CallInput = input({ exists: "boolean", keyedPart: "boolean", keyGiven: "boolean" });
export const StampInput = input({ recorded: optional(string({ examples: Hashes })), current: string({ examples: Hashes }) });

export const Command = commands({
  Key: { input: KeyInput, does: "A key the interpretation wrote. If it cannot be written there (`known` is false), the problem is unknown-key." },
  Slot: {
    input: SlotInput,
    does:
      "One place, and whether Layer 1 and the interpretation each wrote it. If it is not a place that can be written (`known` is " +
      "false), the problem is unknown-key; otherwise, if both wrote it, the problem is conflict (Layer 1 wins, and the interpretation " +
      "may not write over it).",
  },
  State: { input: StateInput, does: "A state Layer 1 listed by name. If it has no description, the problem is undescribed." },
  Entry: {
    input: EntryInput,
    does:
      "An entry the interpretation wrote into a group (a datum, a command, a case, ...). If Layer 1 lists that group's entries " +
      "(`listed`), the group is closed to new entries (`closed`), and Layer 1 does not have this one, the problem is closed.",
  },
  Branching: {
    input: BranchingInput,
    does:
      "How a command branches into cases. If Layer 1 wrote the cases: an outcome written outside the cases (`flat`) is the problem " +
      "flat-in-cases, and a goTo, does or responds Layer 1 wrote outside the cases (`layer1Outcome`) is the problem layer1-outside-cases " +
      "(both may be reported, in that order). Otherwise, if the interpretation wrote the cases: `flat` is the problem flat-in-cases, " +
      "and a goTo Layer 1 wrote (`layer1GoTo`) is the problem branch-over-goto (both may be reported, in that order). If nobody wrote " +
      "cases, there is no problem.",
  },
  Asks: { input: AsksInput, does: "One thing a command asks, and how many queries it names. Unless exactly one, the problem is one-query." },
  Call: {
    input: CallInput,
    does:
      "A command calls a contained component. If there is no such component, the problem is no-part. Otherwise, if it is one of " +
      "many (`keyedPart`) but no key was written, the problem is key-missing; if it is a single component but a key was written, " +
      "the problem is key-extra.",
  },
  Stamp: {
    input: StampInput,
    does: "The hash of Layer 1 recorded in the interpretation (if any) and the hash of Layer 1 now. If one was recorded and it differs, the problem is stale.",
  },
});

export const OverlayCheck = service({
  description: "Reports the problems found when an interpretation is laid over Layer 1, one fact at a time.",
  uses: [Effect, Command],
});
