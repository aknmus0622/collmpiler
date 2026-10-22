import { service, value } from "@clp/core";

// Which words of TypeScript a spec may not write (packages/cli/src/v1/subset.ts, used by the parser in v1/syntax.ts,
// DSL.md §17.5). A body is read as expressions, so a word for control flow, mutation outside `this`, or anything an
// expression cannot say is refused, with the reason. Reading the source is the parser's.
export const SyntaxCheck = service("Decides which words of TypeScript a spec may not write, and why.", {
  queries: {
    Word(word: string): "allowed" | "loop" | "let" | "exception" | "switch" | "function" | "class" | "async" | "generator" | "new" | "delete" | "typeof" | "in" | "jump" {
      return value.word(
        "A word met in a spec. Refused, with the reason: for, while and do (loop); let and var (let); try and throw (exception); " +
          "switch; function; class; await and async (async); yield (generator); new; delete; typeof; in and instanceof (in); " +
          "break and continue (jump). Every other word, any other text included, is allowed.",
      );
    },
  },
});
