// The vocabulary of the 1.0 notation (DSL.md §17). Specs written with it are never executed: the framework reads them
// as syntax (packages/cli/src/v1/syntax.ts) and turns every body into expressions. What is here exists for the type
// checker only — completion, and light errors such as a misspelled state name or two atoms swapped — and the values
// returned at run time are inert markers.
//
// - A component has a description (the first argument), and contents under headings: `state`, `commands`, `queries`,
//   `rules`, `examples`, `conditions`, `calcs`, `decisions`, `components`. Every key under a heading is a name, and a
//   bare string is prose: a component whose contents are not written yet, which the interpretation fills.
// - Commands and queries are methods with typed parameters. State is read and written through `this`.
// - Types are TypeScript types: `Int`, `string`, `boolean`, string literal unions, `Id<"…">` (atoms), object types
//   (records), `T[]` (lists), `T | null`, `Json`. Collections in state are `Map<K, V>()`, `Set<T>()`, `List<T>()`.

/** An integer. In 1.0 every number is an integer (money in whole yen, days, counts). */
export type Int = number;
/** An atom (a value object): an identity with no structure, such as a member number. The argument names it for people. */
export type Id<Description extends string> = string & { readonly __atom?: Description };
/** Any JSON value, carried without being looked into. */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

/** A set, as seen from a body. */
export interface SpecSet<T> {
  readonly size: number;
  has(value: T): boolean;
  add(value: T): void;
  delete(value: T): void;
  some(predicate: (value: T) => boolean): boolean;
  every(predicate: (value: T) => boolean): boolean;
  count(predicate: (value: T) => boolean): number;
  filter(predicate: (value: T) => boolean): SpecSet<T>;
  map<U>(fn: (value: T) => U): SpecSet<U>;
  sum(fn: (value: T) => number): number;
}
/** A relation from keys to at most one value each (a partial function), as seen from a body. */
export interface SpecMap<K, V> {
  readonly size: number;
  has(key: K): boolean;
  get(key: K): V;
  set(key: K, value: V): void;
  delete(key: K): void;
  keys(): SpecSet<K>;
  values(): SpecSet<V>;
  some(predicate: (key: K, value: V) => boolean): boolean;
  every(predicate: (key: K, value: V) => boolean): boolean;
  count(predicate: (key: K, value: V) => boolean): number;
  filter(predicate: (key: K, value: V) => boolean): SpecMap<K, V>;
  sum(fn: (key: K, value: V) => number): number;
}

declare const INIT: unique symbol;
/** A remembered value with its initial value. */
export type Init<T> = { readonly [INIT]: T };

type Live<T> = T extends Init<infer U> ? U : T;
type StateOf<S> = { -readonly [K in keyof S]: S[K] extends string ? any : Live<S[K]> };

type Method = (...args: any[]) => unknown;
type Entries = Record<string, string | Method>;
/** What may be written inside a component. */
export type Contents<S> = {
  state?: S;
  commands?: Entries;
  queries?: Entries;
  rules?: Entries;
  examples?: Record<string, Example>;
  conditions?: Record<string, string | Method | Condition<any[]>>;
  calcs?: Record<string, string | Method | Calc<any[], any>>;
  decisions?: Record<string, string | Decisions<any[], any>>;
  components?: Record<string, Component>;
  /** Fragments written as prose inside a body (`does.name("…")`), filled by the interpretation. */
  does?: Entries;
  /** What the component keeps survives a restart. */
  durable?: true;
  /** How each command reaches the production system over HTTP ("POST /todos/:id"). */
  routes?: Record<string, string>;
  /** Files and text attached to the agent's requests (not part of the meaning). */
  assets?: readonly Asset[];
};

declare const STATE: unique symbol;
type Ports<B> = (B extends { commands: infer C } ? { [K in keyof C]: C[K] extends Method ? (...args: Parameters<C[K]>) => ReturnType<C[K]> : (...args: any[]) => any } : {}) &
  (B extends { queries: infer Q } ? { [K in keyof Q]: Q[K] extends Method ? (...args: Parameters<Q[K]>) => ReturnType<Q[K]> : (...args: any[]) => any } : {});
/** A component. A component written as prose has every port: what it has is not written yet. */
export type Component<S = {}, B = {}> = { readonly [STATE]?: S } & Ports<B> & { readonly [port: string]: any; as(alias: string): Component<S, B> };

/** A component. `service("…")` is prose only; `service("…", { … })` has contents; `service({ … })` has no description. */
export function service(text: string): Component;
export function service<const S extends Record<string, unknown>, const B extends Contents<S>>(text: string, contents: B & { state?: S } & ThisType<StateOf<S>>): Component<S, B>;
export function service<const S extends Record<string, unknown>, const B extends Contents<S>>(contents: B & { state?: S } & ThisType<StateOf<S>>): Component<S, B>;
export function service(..._given: unknown[]): Component {
  return marker("service");
}

type ExternalQuery = (...args: any[]) => unknown;
type ExternalPorts<Q, C> = { [K in keyof Q]: Q[K] extends ExternalQuery ? ((...args: Parameters<Q[K]>) => ReturnType<Q[K]>) & { returns(value: ReturnType<Q[K]>): void } : never } & {
  [K in keyof C]: C[K] extends Method ? (...args: Parameters<C[K]>) => void : never;
};
/** The outside world: no contents, only a promise. Queries answer with a value of their return type; commands are what the component does to it. */
export function external<const Q extends Record<string, ExternalQuery>, const C extends Record<string, Method> = {}>(
  text: string,
  ports: { queries?: Q; commands?: C },
): ExternalPorts<Q, C> & { as(alias: string): ExternalPorts<Q, C> } {
  void text;
  void ports;
  return marker("external");
}
/** The answer of an external query (its type is the query's return type), with the promise it keeps. */
export function answer<T>(promise: { fresh?: true; increasing?: true; mayFail?: true } = {}): T {
  void promise;
  return marker("answer");
}

/** The interpretation of a component: the same headings, filling what Layer 1 left as prose. Written by an LLM, reviewed by a person. */
export function interpretation<S0, const S extends Record<string, unknown>, const B extends Contents<S>>(
  component: Component<S0, any>,
  contents: B & { state?: S } & ThisType<StateOf<S0 & S>>,
): Interpretation;
/** The interpretation of a decision table, named condition or calculation: its fragments (`this` is the state of the component that calls it). */
export function interpretation(fn: (...args: any[]) => unknown, contents: Contents<Record<string, unknown>> & ThisType<any>): Interpretation;
export function interpretation(component: unknown, contents: unknown): Interpretation {
  void component;
  void contents;
  return marker("interpretation");
}
export type Interpretation = { readonly __interpretation?: true };

// --- State ---

/** A remembered value and its initial value. */
export const init = <T>(value: T): Init<T> => value as unknown as Init<T>;
/** A relation from keys to values, empty at first. */
export const Map = <K, V>(): SpecMap<K, V> => marker("map");
/** A set, empty at first. */
export const Set = <T>(): SpecSet<T> => marker("set");
/** A list, for when the order means something. Empty at first, or the given items. */
export const List = <T>(items: readonly T[] = []): T[] => [...items];

// --- Inside bodies ---

/**
 * A condition written inside a body: its name, the sentence, and the expression (left to the interpretation when
 * omitted, under `conditions`). `is.name()` without a sentence is the condition of that name under `conditions`.
 */
export const is: Record<string, (text?: string, value?: boolean) => boolean> = new Proxy({}, { get: () => () => true });
/** Something that happens, written as prose inside a body; filled under `does`. `return does.name("…")` also answers. */
export const does: Record<string, (text: string) => any> = new Proxy({}, { get: () => () => undefined });
/** A value written as prose inside a body; filled under `calcs`. `value.name()` is the calculation of that name under `calcs`. */
export const value: Record<string, (text?: string) => any> = new Proxy({}, { get: () => () => undefined });
/** Puts inputs for which the method is not specified outside the spec (they are never generated). */
export const requires = (condition: boolean): void => void condition;
/** Whether asking an external query failed (the query promised `mayFail`). */
export const failed = (answered: unknown): boolean => answered === FAILED;
const FAILED = Symbol.for("clp.v1.failed");
/** The last case of a decision table. */
export const otherwise = true as const;
export type Otherwise = typeof otherwise;

// --- Named fragments defined elsewhere ---

export type Condition<P extends any[]> = (...args: P) => boolean;
export type Calc<P extends any[], R> = (...args: P) => R;
export type Decisions<P extends any[], R> = (...args: P) => R;
/** A named condition. */
export const condition = <P extends any[]>(text: string, fn?: (...args: P) => boolean): Condition<P> => (fn ?? marker("condition")) as Condition<P>;
/** A named calculation. */
export const calc = <P extends any[], R>(text: string, fn?: (...args: P) => R): Calc<P, R> => (fn ?? marker("calc")) as Calc<P, R>;
/** A decision table: rows of a condition and constants, the last row `otherwise`. Called like a function. */
export function decisions<P extends any[], const Rows extends readonly (readonly [boolean, object])[]>(text: string, rows: (...args: P) => Rows): Decisions<P, Rows[number][1]> {
  void text;
  void rows;
  return marker("decisions");
}

// --- Properties ---

type Temporal = { readonly __temporal?: true };
type Always = ((predicate: () => boolean) => Temporal) & { readonly on: Record<string, (fn: (...args: any[]) => Temporal | boolean) => Temporal> };
/** In every state from now on. `always(() => state predicate)` is an invariant. */
export const always: Always = Object.assign(() => marker("always"), { on: new Proxy({}, { get: () => () => marker("on") }) }) as Always;
export const eventually = (predicate: () => boolean | Temporal): Temporal => marker(String(predicate));
export const after = (predicate: () => boolean | Temporal): Temporal => marker(String(predicate));
export const once = (predicate: () => boolean | Temporal): Temporal => marker(String(predicate));
export const historically = (predicate: () => boolean | Temporal): Temporal => marker(String(predicate));
export const until = (holds: () => boolean, until: () => boolean): Temporal => marker(`${holds}${until}`);

// --- Examples ---

export type Example = { readonly __example?: true };
/** An example the author expects: steps that call components, and what they answer. */
export const example = (text: string, steps: () => void): Example => marker(`${text}${steps}`);
export const expect = <T>(value: T) => ({ toBe: (expected: T) => void expected, toEqual: (expected: unknown) => void expected });

// --- Assets ---

export type AssetPhase = "design" | "wiring" | "implementation";
export type Asset = { readonly kind: "file" | "dir" | "text"; readonly path?: string; readonly text?: string; readonly phases?: readonly AssetPhase[] };
export const file = (path: string, options: { phases?: readonly AssetPhase[] } = {}): Asset => ({ kind: "file", path, ...options });
export const dir = (path: string, options: { phases?: readonly AssetPhase[] } = {}): Asset => ({ kind: "dir", path, ...options });
export const text = (content: string, options: { phases?: readonly AssetPhase[] } = {}): Asset => ({ kind: "text", text: content, ...options });

function marker<T>(what: string): T {
  return { $v1: what } as T;
}
