import { answer, decisions, does, external, failed, init, is, otherwise, requires, service, value } from "@clp/core";
import type { Int, Json } from "@clp/core";

export const PromiseKeeper = service("Turns answers drawn at random into answers that keep a dependency's promises, and decides what survives a restart.", {
  state: {
    // The value drawn for the fresh answer being decided (a number or a text).
    freshDrawn: init<Json>(null),
    // The values answered before by the query whose fresh answer is being decided, in the order given.
    used: init<Json[]>([]),
  },
  commands: {
    BeginFreshNumber(drawn: Int) {
      requires(drawn >= 0 && drawn <= 4);
      does.beginFreshNumber("The fresh answer of a query that answers numbers is decided next, for the number drawn. No value answered before has been given yet.");
    },
    BeginFreshText(drawn: string) {
      does.beginFreshText("The fresh answer of a query that answers texts is decided next, for the text drawn. No value answered before has been given yet.");
    },
    UsedNumber(answered: Int) {
      // only after a Begin: the values answered before belong to the fresh answer being decided
      requires(this.freshDrawn !== null && answered >= 0 && answered <= 4);
      does.usedNumber("A number the query answered before.");
    },
    UsedText(answered: string) {
      requires(this.freshDrawn !== null);
      does.usedText("A text the query answered before.");
    },
  },
  queries: {
    Increasing(drawn: Int, previous: Int | null, delta: Int, max: Int | null): Int {
      requires(drawn >= -1000 && drawn <= 1000 && delta >= 0 && delta <= 100);
      return value.increasing("The answer of a query that promises never to answer less than before. If it has not answered before (`previous` is null), the value drawn. Otherwise the previous answer plus the increment `delta`, but not more than `max` when a maximum is given.");
    },
    Fresh(): Json {
      return value.fresh("The fresh answer: the value drawn, if it is not one of the values answered before (the same number, or the same text). Otherwise, if it is a number, one more than the largest number answered before; if it is a text, the text drawn followed by \"#\" and the number of values answered before (counting every value given, of either kind).");
    },
    Restart(durable: boolean): "keep" | "start-again" {
      return value.restart("The system restarts. A component that is durable keeps its state and data; any other starts again.");
    },
  },
});
