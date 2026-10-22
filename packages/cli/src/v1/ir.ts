// IR version 8 (DSL.md §17.9): the language-independent core every 1.0 spec is turned into. No prose is left in its
// meaning: descriptions are in `notes`, the sentences each element came from in `trace`. Expressions are s-expressions
// (`["in", x, s]`); behaviour is events in the Event-B discipline (parameters, guard, assignments, calls, output),
// one per case of a command, with exclusive guards.

/** A type. Every number is an integer. */
export type Type =
  | "int"
  | "string"
  | "bool"
  | "json"
  | { enum: readonly (string | number | boolean)[] }
  | { atom: string }
  | { record: Record<string, Type> }
  | { list: Type }
  | { set: Type }
  | { map: readonly [Type, Type] }
  | { optional: Type };

/**
 * An expression. Numbers, booleans and null are themselves; everything else is `[operator, ...arguments]`, and a
 * string constant is `["lit", "text"]` — a bare string is never a value. The operators are listed in ops.ts.
 */
export type Expr = number | boolean | null | readonly [string, ...unknown[]];

export type Params = Record<string, Type>;

/** A command of another component called in an event: a part's command (its state changes in the same step) or an external one (an effect). */
export type Call = { component: string; command: string; args: Record<string, Expr>; when?: Expr };

export type Event = {
  command: string;
  guard: Expr;
  /** The next value of each state field the event changes (written over the values before the step). */
  assign: Record<string, Expr>;
  calls: Call[];
  output?: Expr;
};

export type Port = { params: Params; result: Type; promise?: "fresh" | "increasing"; mayFail?: true };

export type ComponentIr = {
  /** The outside world: only promises, no contents. */
  external?: { queries: Record<string, Port>; commands: Record<string, { params: Params }> };
  /** Components inside this one (their state is this component's) and outside it (verified against their spec or their promise). */
  contains?: string[];
  relies?: string[];
  durable?: true;
  routes?: Record<string, string>;
  state?: Record<string, Type>;
  init?: Record<string, Expr>;
  commands?: Record<string, { params: Params; output?: Type; requires?: Expr; events: string[] }>;
  events?: Record<string, Event>;
  queries?: Record<string, { params: Params; result: Type; requires?: Expr; is: Expr }>;
  conditions?: Record<string, { params: Params; is: Expr }>;
  calcs?: Record<string, { params: Params; result: Type; is: Expr }>;
  decisions?: Record<string, { params: Params; result: Type; rows: { when: Expr; then: Record<string, Expr> }[] }>;
  properties?: Record<string, { kind: "invariant" | "temporal"; is: Expr }>;
};

/** A step of an example or a trace: an event of some component (`library.Borrow`), its arguments, and what it answers. */
export type TraceStep = {
  event: string;
  params: Record<string, unknown>;
  output?: unknown;
  /** The answers of the outside world during the step (`clock.Today`), when they matter. */
  answers?: Record<string, unknown>;
};

export type Ir8 = {
  irVersion: 8;
  /** The component this IR verifies. Its entries are what the production system is driven through. */
  root: string;
  sorts: string[];
  components: Record<string, ComponentIr>;
  /** What is driven from outside: the root's commands, its parts' commands that nothing inside calls, and every query. */
  entries: { commands: string[]; queries: string[] };
  examples?: Record<string, { steps: (TraceStep | { expect: { event: string; params: Record<string, unknown>; output: unknown } })[] }>;
  /** Prose, for people and agents only. Never read for meaning. */
  notes?: Record<string, string>;
  /** Which elements each sentence of Layer 1 became. */
  trace?: Record<string, string[]>;
};

export const IR8_VERSION = 8;
