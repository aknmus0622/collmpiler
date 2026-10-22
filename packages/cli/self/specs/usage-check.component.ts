import { service, value } from "@clp/core";

// What a spec declares but never uses (packages/cli/src/v1/usage.ts, used when an IR is built in v1/load.ts).
export const UsageCheck = service("Decides which declared things are never used.", {
  queries: {
    Declared(kind: "state" | "query" | "command", read: boolean, written: boolean): "none" | "never-read" | "never-asked" | "never-called" {
      return value.declared(
        "Something declared, and whether it is read and written. A state field nothing reads is never-read (it can show in no " +
          "observation); a query of the outside world nothing asks is never-asked; a command of the outside world nothing calls " +
          "(nothing writes to it) is never-called.",
      );
    },
  },
});
