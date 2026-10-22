// The constants the mutation gate breaks for a 1.0 spec (IR version 8): decision-table cells, and constants answered
// (by commands, queries and the calculations they answer with) or sent to the outside world. Strings in production code are broken only when they are one of these.

import type { Ir8 } from "./ir.ts";

type DecisionValue = string | number;

export function decisionValues8(ir: Ir8): DecisionValue[] {
  const values = new Set<DecisionValue>();
  const constant = (node: unknown) => {
    if (typeof node === "number") values.add(node);
    else if (Array.isArray(node)) {
      if (node[0] === "lit") literal(node[1]);
      else if (["state", "var", "cond", "calc", "decide", "ask", "outputOf"].includes(node[0] as string)) node.slice(1).forEach((x) => typeof x === "object" && constant(x));
      else node.slice(1).forEach(constant);
    } else if (typeof node === "object" && node !== null) Object.values(node).forEach(constant);
  };
  const literal = (value: unknown) => {
    if (typeof value === "number" || typeof value === "string") values.add(value);
    else if (typeof value === "object" && value !== null) Object.values(value).forEach(literal);
  };
  for (const component of Object.values(ir.components)) {
    for (const table of Object.values(component.decisions ?? {})) for (const row of table.rows) Object.values(row.then).forEach(constant);
    // what queries and calculations answer (a query's answer is often a calculation's)
    for (const query of Object.values(component.queries ?? {})) constant(query.is);
    for (const calc of Object.values(component.calcs ?? {})) constant(calc.is);
    for (const event of Object.values(component.events ?? {})) {
      constant(event.output);
      for (const call of event.calls) if (ir.components[call.component]?.external) constant(call.args);
    }
  }
  return [...values];
}

