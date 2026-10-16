import { decisionTable } from "@clp/core";

// The rules of the list, as numbers. They apply always, so the table has only `otherwise`.
export const Limits = decisionTable({
  otherwise: {
    // A title longer than this many characters is refused
    maxTitleLength: 100,
  },
});
