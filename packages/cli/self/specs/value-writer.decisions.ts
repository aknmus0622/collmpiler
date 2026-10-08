import { decisionTable } from "@clp/core";

// How a reference begins when it is written into the IR: what it refers to, then a colon.
export const ReferenceForm = decisionTable({
  "The reference is to an input of the command": { prefix: "input:" },
  "The reference is to remembered data": { prefix: "data:" },
  "The reference is to a query answer": { prefix: "query:" },
  "The reference is to a calculation": { prefix: "calculation:" },
  // What remains: a column of a decision table
  otherwise: { prefix: "decision:" },
});
