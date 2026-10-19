import { among, commands, data, effects, input, integer, list, queries, service } from "@clp/core";

// The tree check (packages/core/index.ts `check`): whether what was written fits the grammar. A specification is a tree of
// nodes; the grammar (`GRAMMAR`, built from the kinds) says, for a parent kind and a child's slot, whether the child may be
// there and how many times. This component is given the children of one parent at a time, in the order they were written,
// and asks the grammar. It reports what does not fit, and says which children to look inside. The walk over the tree, and
// the wording of the reports, belong to the framework.
export const Data = data({
  parent: { type: "string", description: "The kind of the parent whose children are being given." },
  slots: { type: list("string"), initially: [], description: "The slot of every child given so far that fits under the parent, in order (a slot appears once per child)." },
  names: { type: list("string"), initially: [], description: "The identity (kind and name) of every child given so far that fits and has a name." },
});

export const Query = queries({
  allowed: { description: "Whether a child in this slot may be under a parent of this kind.", input: input({ parent: "string", slot: "string" }), output: "boolean" },
  limit: {
    description: "How many children in this slot a parent of this kind may have; 0 when there is no limit.",
    input: input({ parent: "string", slot: "string" }),
    output: integer({ min: 0, max: 1 }),
  },
  stateNamed: { description: "Whether the parent has a state child with this name.", input: input({ name: "string" }), output: "boolean" },
});

const Index = integer({ min: 0, max: 1000 });

export const Effect = effects({
  Report: {
    description: "The child at this position (among the parent's children) does not fit, for this reason.",
    input: input({ code: ["unknown-field", "unknown", "misplaced", "too-many", "duplicate", "unknown-state"], index: Index }),
  },
  Descend: { description: "Look inside the child at this position: its own children are checked next.", input: input({ index: Index }) },
});

export const BeginInput = input({ kind: "string" });
// A child's slot and identity are usually ones already given under the same parent (a second output, a second state "A").
// identity: the child's kind and name together (two children have the same identity when both kind and name are the same)
export const ChildInput = input({ index: Index, slot: among(Data.slots), named: "boolean", identity: among(Data.names) });
export const StrayInput = input({ index: Index, form: ["bad-field", "unknown"] });
export const EndInput = input({ isComponent: "boolean", hasInit: "boolean", initIndex: Index, init: "string", stateCount: integer({ min: 0, max: 1000 }) });

export const Command = commands({
  BeginParent: {
    input: BeginInput,
    does: "The children of a parent of this kind are given next. Nothing has been given for this parent yet.",
  },
  Stray: {
    input: StrayInput,
    does:
      "One child, at this position, that is not a node of the grammar. A field the parent's kind does not have (form bad-field) is " +
      "reported as unknown-field, and something that is not a node at all (form unknown) as unknown. Neither is looked inside, and " +
      "neither counts for the children that follow.",
  },
  Child: {
    input: ChildInput,
    does:
      "One child, at this position, that is a node. If its slot may not be under the parent, it is reported as misplaced and not " +
      "looked inside. Otherwise it fits: it is counted in its slot, and if that " +
      "makes one more child in the slot than the limit allows (exactly one more; with no limit, never), it is reported as too-many. " +
      "If it has a name and a child with the same identity was already given and fit, it is also reported as duplicate (after too-many, when both are reported). " +
      "A node that fits is looked inside, after what is reported about it.",
  },
  EndParent: {
    input: EndInput,
    does:
      "All the children have been given (and looked inside). If the parent is a component that has an initial state (given at " +
      "position initIndex) and at least one state, and no state has the initial state's name, the initial state is reported as " +
      "unknown-state.",
  },
});

export const TreeCheck = service({
  description: "Checks, one parent at a time, whether the children of a specification's nodes fit the grammar.",
  uses: [Data, Query, Effect, Command],
});
