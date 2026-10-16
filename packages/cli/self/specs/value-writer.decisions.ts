import { conditions, decisions, otherwise } from "@clp/core";
export const ReferenceFormIf = conditions({
  referenceInputCommand: "The reference is to an input of the command",
  referenceRememberedData: "The reference is to remembered data",
  referenceQueryAnswer: "The reference is to a query answer",
  referenceCalculation: "The reference is to a calculation",
});

export const Decision = decisions({
  // How a reference begins when it is written into the IR: what it refers to, then a colon.
  form: [
    ReferenceFormIf.referenceInputCommand.then({ prefix: "input:" }),
    ReferenceFormIf.referenceRememberedData.then({ prefix: "data:" }),
    ReferenceFormIf.referenceQueryAnswer.then({ prefix: "query:" }),
    ReferenceFormIf.referenceCalculation.then({ prefix: "calculation:" }),
    // What remains: a column of a decision table
    otherwise({ prefix: "decision:" }),
  ],
});
