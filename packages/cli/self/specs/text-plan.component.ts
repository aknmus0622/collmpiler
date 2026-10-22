import { service, value } from "@clp/core";

// How the adapter contract is written (packages/cli/src/v1/generate.ts: `typeText8Stage0`, `notes8Stage0`,
// `sections8Stage0`): how each type is written in TypeScript, which notes a query of the outside world carries, and which
// sections the contract has. The fixed prose of the contract stays hand-written; only these choices are decided here.
export type Entry = { name: string; text: string; plain: boolean };

export const TextPlan = service("Decides how types are written in the adapter contract, which notes a query carries, and which sections the contract has.", {
  queries: {
    TypeText(
      kind: "int" | "string" | "bool" | "json" | "enum" | "atom" | "optional" | "list" | "set" | "map" | "record",
      name: string,
      inner: string,
      key: string,
      entries: Entry[],
      members: string[],
    ): string {
      return value.typeText(
        "How one type is written, given what is inside it already written. An integer is number, a string string, a boolean " +
          "boolean, JSON is Json. An enumeration is all its members (however many there are) joined by \" | \" (never when it has none). An atom is the name " +
          "of its sort. An optional value is what is inside, followed by \" | null\". A list and a set are what is inside " +
          "followed by \"[]\"; what is inside is put in parentheses when it contains \"|\" or \"&\" and does not start with " +
          "\"{\". A map is \"{ key: K; value: V }[]\" with the key (key) and the value (inner). A record is \"{ \", its fields as " +
          "\"name: text\" (all of them, however many there are) joined by \"; \", then \" }\" (a name that is not plain is written as a JSON string), or " +
          "Record<string, never> when it has no field.",
      );
    },
    Notes(promise: "none" | "fresh" | "increasing", mayFail: boolean): ("fresh" | "increasing" | "may-fail")[] {
      return value.notes("The notes a query of the outside world carries: its promise if it has one, then may-fail if it may fail.");
    },
    Sections(
      answering: number,
      queries: number,
      routes: number,
      restarts: boolean,
      sorts: number,
      json: boolean,
    ): { commandOutput: boolean; queries: boolean; routes: boolean; restarts: boolean; sorts: boolean; json: boolean } {
      return value.sections(
        "Which sections the contract has, from how many commands answer, how many queries and routes there are, whether the " +
          "system restarts, how many sorts of atoms there are, and whether JSON values appear: the answers of commands when some " +
          "command answers; queries when there is one; routes when there is one; restarts when the system restarts; the sorts " +
          "when there is one; the JSON type when JSON values appear.",
      );
    },
  },
});
