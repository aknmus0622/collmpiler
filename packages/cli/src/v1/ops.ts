// The table of operators (DSL.md §17.10): one place that says what each operator of the IR means, how it reads in
// Japanese (for the person who checks an interpretation) and in English (for the agent that implements it), and how
// it is written in Alloy 6 (alloy.ts). The reading, the oracle (eval.ts) and the checker all follow this table.

import type { Expr } from "./ir.ts";

type Render = (args: unknown[], r: (e: unknown) => string) => string;
export type Op = { name: string; meaning: string; ja: Render; en: Render };

const binders = (b: unknown) => (b as string[]).join(", ");
const argList = (args: unknown, r: (e: unknown) => string) =>
  Object.entries(args as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${r(v)}`)
    .join(", ");
const cmp = (sym: string, ja: string, en: string): Op => ({
  name: sym,
  meaning: `${en} (integers)`,
  ja: ([a, b], r) => `${r(a)} が ${r(b)} ${ja}`,
  en: ([a, b], r) => `${r(a)} ${sym} ${r(b)}`,
});

export const OPS: Op[] = [
  { name: "lit", meaning: '`["lit", value]`: a constant (a bare string is never a value)', ja: ([v]) => JSON.stringify(v), en: ([v]) => JSON.stringify(v) },
  { name: "var", meaning: '`["var", name]`: a parameter of the command or query, or a name bound by an operator', ja: ([n]) => String(n), en: ([n]) => String(n) },
  { name: "state", meaning: '`["state", field]`: the value of the component\'s own state field before the step', ja: ([f]) => `this.${f}`, en: ([f]) => `this.${f}` },
  { name: "and", meaning: "all of them hold", ja: (a, r) => a.map((x) => r(x)).join(" かつ "), en: (a, r) => a.map((x) => r(x)).join(" and ") },
  { name: "or", meaning: "one of them holds", ja: (a, r) => a.map((x) => r(x)).join(" または "), en: (a, r) => a.map((x) => r(x)).join(" or ") },
  { name: "not", meaning: "it does not hold", ja: ([a], r) => `(${r(a)}) でない`, en: ([a], r) => `not (${r(a)})` },
  { name: "implies", meaning: "if the first holds, so does the second", ja: ([a, b], r) => `${r(a)} ならば ${r(b)}`, en: ([a, b], r) => `${r(a)} implies ${r(b)}` },
  { name: "ite", meaning: '`["ite", c, a, b]`: a if c holds, otherwise b', ja: ([c, a, b], r) => `${r(c)} なら ${r(a)}、でなければ ${r(b)}`, en: ([c, a, b], r) => `(if ${r(c)} then ${r(a)} else ${r(b)})` },
  { name: "=", meaning: "equal (values of any type; sets and maps compare as sets)", ja: ([a, b], r) => `${r(a)} が ${r(b)} と等しい`, en: ([a, b], r) => `${r(a)} = ${r(b)}` },
  cmp("<", "より小さい", "less than"),
  cmp("<=", "以下", "at most"),
  cmp(">", "より大きい", "greater than"),
  cmp(">=", "以上", "at least"),
  { name: "+", meaning: "sum of two integers", ja: ([a, b], r) => `${r(a)} + ${r(b)}`, en: ([a, b], r) => `${r(a)} + ${r(b)}` },
  { name: "-", meaning: "difference of two integers", ja: ([a, b], r) => `${r(a)} − ${r(b)}`, en: ([a, b], r) => `${r(a)} - ${r(b)}` },
  { name: "*", meaning: "product of two integers", ja: ([a, b], r) => `${r(a)} × ${r(b)}`, en: ([a, b], r) => `${r(a)} * ${r(b)}` },
  { name: "div", meaning: "integer division, rounded down (Math.floor(a / b))", ja: ([a, b], r) => `${r(a)} ÷ ${r(b)} の切り捨て`, en: ([a, b], r) => `floor(${r(a)} / ${r(b)})` },
  { name: "mod", meaning: "remainder (JavaScript's %)", ja: ([a, b], r) => `${r(a)} を ${r(b)} で割った余り`, en: ([a, b], r) => `${r(a)} % ${r(b)}` },
  { name: "neg", meaning: "negation of an integer", ja: ([a], r) => `−${r(a)}`, en: ([a], r) => `-${r(a)}` },
  { name: "min", meaning: "the smaller of two integers", ja: ([a, b], r) => `${r(a)} と ${r(b)} の小さいほう`, en: ([a, b], r) => `min(${r(a)}, ${r(b)})` },
  { name: "max", meaning: "the larger of two integers", ja: ([a, b], r) => `${r(a)} と ${r(b)} の大きいほう`, en: ([a, b], r) => `max(${r(a)}, ${r(b)})` },
  { name: "abs", meaning: "absolute value", ja: ([a], r) => `${r(a)} の絶対値`, en: ([a], r) => `abs(${r(a)})` },
  { name: "nonNull", meaning: "the value, which is never null here (TypeScript's `x!`)", ja: ([a], r) => `${r(a)}（null ではない）`, en: ([a], r) => `${r(a)}!` },
  { name: "??", meaning: "the first value, or the second when the first is null", ja: ([a, b], r) => `${r(a)}（無ければ ${r(b)}）`, en: ([a, b], r) => `${r(a)} ?? ${r(b)}` },
  { name: "concat", meaning: "strings joined, or lists joined, in order", ja: (a, r) => a.map((x) => r(x)).join(" ++ "), en: (a, r) => a.map((x) => r(x)).join(" ++ ") },
  { name: "str", meaning: "an integer written as a decimal string", ja: ([a], r) => `${r(a)} を文字列にしたもの`, en: ([a], r) => `String(${r(a)})` },
  { name: "strlen", meaning: "the number of characters (Unicode code points, `[...s].length`)", ja: ([a], r) => `${r(a)} の文字数`, en: ([a], r) => `length(${r(a)})` },
  { name: "trim", meaning: "the string without leading and trailing whitespace (String.prototype.trim)", ja: ([a], r) => `${r(a)} の前後の空白を除いたもの`, en: ([a], r) => `trim(${r(a)})` },
  { name: "lower", meaning: "lower case", ja: ([a], r) => `${r(a)} の小文字`, en: ([a], r) => `lower(${r(a)})` },
  { name: "upper", meaning: "upper case", ja: ([a], r) => `${r(a)} の大文字`, en: ([a], r) => `upper(${r(a)})` },
  { name: "startsWith", meaning: "the string starts with the other", ja: ([a, b], r) => `${r(a)} が ${r(b)} で始まる`, en: ([a, b], r) => `${r(a)} starts with ${r(b)}` },
  { name: "endsWith", meaning: "the string ends with the other", ja: ([a, b], r) => `${r(a)} が ${r(b)} で終わる`, en: ([a, b], r) => `${r(a)} ends with ${r(b)}` },
  { name: "substr", meaning: "the string contains the other", ja: ([a, b], r) => `${r(a)} が ${r(b)} を含む`, en: ([a, b], r) => `${r(a)} contains ${r(b)}` },
  { name: "record", meaning: '`["record", { field: expr }]`: a record with those fields', ja: ([f], r) => `{ ${argList(f, r)} }`, en: ([f], r) => `{ ${argList(f, r)} }` },
  { name: "field", meaning: '`["field", record, name]`: one field of a record', ja: ([a, f], r) => `${r(a)}.${f}`, en: ([a, f], r) => `${r(a)}.${f}` },
  { name: "with", meaning: '`["with", record, { field: expr }]`: the record with those fields replaced', ja: ([a, f], r) => `${r(a)} の { ${argList(f, r)} } を変えたもの`, en: ([a, f], r) => `{ ...${r(a)}, ${argList(f, r)} }` },
  { name: "list", meaning: "a list of the values, in this order", ja: (a, r) => `[${a.map((x) => r(x)).join(", ")}]`, en: (a, r) => `[${a.map((x) => r(x)).join(", ")}]` },
  { name: "len", meaning: "the length of a list", ja: ([a], r) => `${r(a)} の長さ`, en: ([a], r) => `length(${r(a)})` },
  { name: "at", meaning: "the element of a list at an index (from 0)", ja: ([a, i], r) => `${r(a)} の ${r(i)} 番目`, en: ([a, i], r) => `${r(a)}[${r(i)}]` },
  { name: "emptySet", meaning: "the empty set", ja: () => "空の集合", en: () => "{}" },
  { name: "emptyMap", meaning: "the empty map", ja: () => "空の対応", en: () => "{}" },
  { name: "set", meaning: "a set of the values", ja: (a, r) => `{${a.map((x) => r(x)).join(", ")}}`, en: (a, r) => `{${a.map((x) => r(x)).join(", ")}}` },
  { name: "in", meaning: '`["in", x, s]`: x is a member of the set (or the list) s', ja: ([x, s], r) => `${r(x)} が ${r(s)} にある`, en: ([x, s], r) => `${r(x)} in ${r(s)}` },
  { name: "card", meaning: "the number of members of a set (or elements of a list)", ja: ([a], r) => `${r(a)} の数`, en: ([a], r) => `size(${r(a)})` },
  { name: "add", meaning: '`["add", s, x]`: the set with x added', ja: ([s, x], r) => `${r(s)} に ${r(x)} を加えたもの`, en: ([s, x], r) => `${r(s)} + {${r(x)}}` },
  { name: "remove", meaning: '`["remove", s, x]`: the set without x', ja: ([s, x], r) => `${r(s)} から ${r(x)} を除いたもの`, en: ([s, x], r) => `${r(s)} - {${r(x)}}` },
  { name: "dom", meaning: "the keys of a map (a set)", ja: ([m], r) => `${r(m)} のキー`, en: ([m], r) => `keys(${r(m)})` },
  { name: "ran", meaning: "the values of a map (a set)", ja: ([m], r) => `${r(m)} の値`, en: ([m], r) => `values(${r(m)})` },
  { name: "apply", meaning: '`["apply", m, k]`: the value of key k in the map m (k is always a key there)', ja: ([m, k], r) => `${r(m)} の ${r(k)} の値`, en: ([m, k], r) => `${r(m)}[${r(k)}]` },
  { name: "override", meaning: '`["override", m, k, v]`: the map m with key k set to v', ja: ([m, k, v], r) => `${r(m)} の ${r(k)} を ${r(v)} にしたもの`, en: ([m, k, v], r) => `${r(m)} with ${r(k)} -> ${r(v)}` },
  { name: "dsub", meaning: '`["dsub", m, k]`: the map m without key k', ja: ([m, k], r) => `${r(m)} から ${r(k)} を除いたもの`, en: ([m, k], r) => `${r(m)} without ${r(k)}` },
  { name: "some", meaning: '`["some", c, [x], p]`: p holds for some element x of c (for a map, `[k, v]` binds each key and value)', ja: ([c, b, p], r) => `${r(c)} のある ${binders(b)} で ${r(p)}`, en: ([c, b, p], r) => `some ${binders(b)} in ${r(c)}: ${r(p)}` },
  { name: "every", meaning: '`["every", c, [x], p]`: p holds for every element', ja: ([c, b, p], r) => `${r(c)} のすべての ${binders(b)} で ${r(p)}`, en: ([c, b, p], r) => `every ${binders(b)} in ${r(c)}: ${r(p)}` },
  { name: "count", meaning: '`["count", c, [x], p]`: how many elements satisfy p', ja: ([c, b, p], r) => `${r(c)} のうち ${r(p)} である ${binders(b)} の数`, en: ([c, b, p], r) => `count ${binders(b)} in ${r(c)} where ${r(p)}` },
  { name: "sum", meaning: '`["sum", c, [x], e]`: the sum of e over the elements', ja: ([c, b, e], r) => `${r(c)} の ${binders(b)} についての ${r(e)} の合計`, en: ([c, b, e], r) => `sum over ${binders(b)} in ${r(c)} of ${r(e)}` },
  { name: "filter", meaning: '`["filter", c, [x], p]`: the elements that satisfy p (same kind of collection; a list keeps its order)', ja: ([c, b, p], r) => `${r(c)} のうち ${r(p)} である ${binders(b)}`, en: ([c, b, p], r) => `${r(c)} where ${binders(b)}: ${r(p)}` },
  { name: "map", meaning: '`["map", c, [x], e]`: e for each element (a list keeps its order)', ja: ([c, b, e], r) => `${r(c)} の各 ${binders(b)} の ${r(e)}`, en: ([c, b, e], r) => `${r(e)} for each ${binders(b)} in ${r(c)}` },
  { name: "find", meaning: '`["find", list, [x], p]`: the first element that satisfies p, or null', ja: ([c, b, p], r) => `${r(c)} のうち ${r(p)} である最初の ${binders(b)}（無ければ null）`, en: ([c, b, p], r) => `first ${binders(b)} in ${r(c)} where ${r(p)} (or null)` },
  { name: "cond", meaning: '`["cond", name, { param: expr }]`: the named condition of this component (in `conditions`) with those arguments', ja: ([n, a], r) => `${n}(${argList(a, r)})`, en: ([n, a], r) => `${n}(${argList(a, r)})` },
  { name: "calc", meaning: '`["calc", name, { param: expr }]`: the named calculation (in `calcs`)', ja: ([n, a], r) => `${n}(${argList(a, r)})`, en: ([n, a], r) => `${n}(${argList(a, r)})` },
  { name: "decide", meaning: '`["decide", table, { param: expr }]`: the `then` of the first row of the decision table whose `when` holds', ja: ([n, a], r) => `${n}(${argList(a, r)})`, en: ([n, a], r) => `${n}(${argList(a, r)})` },
  { name: "ask", meaning: '`["ask", component, query, { param: expr }]`: the answer of a query of another component (one inside this one: its query evaluated on its state; the outside world: whatever it answers)', ja: ([c, q, a], r) => `${c}.${q}(${argList(a, r)})`, en: ([c, q, a], r) => `${c}.${q}(${argList(a, r)})` },
  { name: "failed", meaning: '`["failed", ask]`: asking the outside world failed this time (only for queries that promise `mayFail`)', ja: ([a], r) => `${r(a)} が失敗した`, en: ([a], r) => `${r(a)} failed` },
  { name: "outputOf", meaning: '`["outputOf", component, command, { param: expr }]`: what that command of a component inside this one answers when called in this step (it is called in `calls`)', ja: ([c, n, a], r) => `${c}.${n}(${argList(a, r)}) の答え`, en: ([c, n, a], r) => `the answer of ${c}.${n}(${argList(a, r)})` },
  { name: "always", meaning: "in every state from now on", ja: ([a], r) => `いつでも ${r(a)}`, en: ([a], r) => `always (${r(a)})` },
  { name: "eventually", meaning: "in some state from now on", ja: ([a], r) => `いつか ${r(a)}`, en: ([a], r) => `eventually (${r(a)})` },
  { name: "after", meaning: "in the next state", ja: ([a], r) => `次の時点で ${r(a)}`, en: ([a], r) => `after (${r(a)})` },
  { name: "once", meaning: "in some state up to now", ja: ([a], r) => `以前に一度 ${r(a)}`, en: ([a], r) => `once (${r(a)})` },
  { name: "historically", meaning: "in every state up to now", ja: ([a], r) => `これまでずっと ${r(a)}`, en: ([a], r) => `historically (${r(a)})` },
  { name: "until", meaning: "the first holds until the second does", ja: ([a, b], r) => `${r(b)} まで ${r(a)}`, en: ([a, b], r) => `(${r(a)}) until (${r(b)})` },
  { name: "on", meaning: '`["on", command, { param: name }, p]`: when this component\'s command happens (leaving this state), with its parameters bound to the names, p holds', ja: ([c, b, p], r) => `${c}(${Object.values(b as object).join(", ")}) が起きたら ${r(p)}`, en: ([c, b, p], r) => `when ${c}(${Object.values(b as object).join(", ")}) happens: ${r(p)}` },
];

export const OP = new Map(OPS.map((op) => [op.name, op]));

/** An expression read aloud, in Japanese (for people) or English (for agents). */
export function readOut(e: Expr | unknown, language: "ja" | "en"): string {
  if (e === null) return "null";
  if (typeof e !== "object") return String(e);
  if (!Array.isArray(e)) return JSON.stringify(e);
  const op = OP.get(e[0] as string);
  if (!op) return JSON.stringify(e);
  return op[language](e.slice(1), (x) => readOut(x, language));
}
