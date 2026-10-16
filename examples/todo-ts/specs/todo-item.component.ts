import { component, data, does, output, states } from "@clp/core";

// One item of the to-do list, as a component of its own: its life (open → done) is structure, not a calculation
// hidden in the list. The list (todos.component.ts) contains many of them, one per identifier.
export const State = states("OPEN", "DONE");
export const Data = data({ title: "string" });

export const TodoItem = component({
  description: "One item of a to-do list. It is open until it is completed.",
  states: State,
  init: State.OPEN,
  data: Data,
  commands: {
    Complete: component(
      output(["completed", "already-done"]),
      does("An open item becomes done, and the answer is completed. An item that is already done stays done, and the answer is already-done."),
    ),
  },
});
