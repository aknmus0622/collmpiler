import { conditions, decisionTable, otherwise, when } from "@clp/core";
export const ReferenceFormIf = conditions({
  referenceInputCommand: "The reference is to an input of the command",
  referenceRememberedData: "The reference is to remembered data",
  referenceQueryAnswer: "The reference is to a query answer",
  referenceCalculation: "The reference is to a calculation",
});


// How a reference begins when it is written into the IR: what it refers to, then a colon.
export const ReferenceForm = decisionTable(
  when(ReferenceFormIf.referenceInputCommand, { prefix: "input:" }),
  when(ReferenceFormIf.referenceRememberedData, { prefix: "data:" }),
  when(ReferenceFormIf.referenceQueryAnswer, { prefix: "query:" }),
  when(ReferenceFormIf.referenceCalculation, { prefix: "calculation:" }),
  // What remains: a column of a decision table
  otherwise({ prefix: "decision:" }),
);
