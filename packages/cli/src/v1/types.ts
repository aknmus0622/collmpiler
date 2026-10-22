// Types of the 1.0 notation while reading: the IR's types, plus what only exists while a body is being read
// (`any` for an empty collection whose element type is not known yet, `null`, `void`, and temporal formulas).

import type { Type } from "./ir.ts";

export type T = Type | "any" | "null" | "void" | "temporal";

export const isOptional = (t: T): t is { optional: Type } => typeof t === "object" && "optional" in t;
export const isEnum = (t: T): t is { enum: readonly (string | number | boolean)[] } => typeof t === "object" && "enum" in t;
export const isAtom = (t: T): t is { atom: string } => typeof t === "object" && "atom" in t;
export const isRecord = (t: T): t is { record: Record<string, Type> } => typeof t === "object" && "record" in t;
export const isList = (t: T): t is { list: Type } => typeof t === "object" && "list" in t;
export const isSet = (t: T): t is { set: Type } => typeof t === "object" && "set" in t;
export const isMap = (t: T): t is { map: readonly [Type, Type] } => typeof t === "object" && "map" in t;

/** The type without `| null`. */
export const nonNull = (t: T): T => (isOptional(t) ? t.optional : t === "null" ? "any" : t);

/** The kind of value, ignoring which literals an enumeration has: strings and enumerations of strings are both "string". */
export function baseOf(t: T): "int" | "string" | "bool" | "json" | "atom" | "record" | "list" | "set" | "map" | "optional" | "any" | "null" | "void" | "temporal" {
  if (typeof t === "string") return t;
  if (isEnum(t)) return typeof t.enum[0] === "number" ? "int" : typeof t.enum[0] === "boolean" ? "bool" : "string";
  if (isAtom(t)) return "atom";
  if (isRecord(t)) return "record";
  if (isList(t)) return "list";
  if (isSet(t)) return "set";
  if (isMap(t)) return "map";
  return "optional";
}

export function show(t: T): string {
  if (typeof t === "string") return t === "int" ? "Int" : t === "bool" ? "boolean" : t === "json" ? "Json" : t;
  if (isEnum(t)) return t.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (isAtom(t)) return t.atom;
  if (isRecord(t)) return `{ ${Object.entries(t.record).map(([k, v]) => `${k}: ${show(v)}`).join("; ")} }`;
  if (isList(t)) return `${show(t.list)}[]`;
  if (isSet(t)) return `Set<${show(t.set)}>`;
  if (isMap(t)) return `Map<${show(t.map[0])}, ${show(t.map[1])}>`;
  return `${show(t.optional)} | null`;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The smallest type both fit in, or undefined when there is none (a string and a number). */
export function join(a: T, b: T): T | undefined {
  if (a === "any") return b;
  if (b === "any") return a;
  if (same(a, b)) return a;
  if (a === "null") return b === "null" ? "null" : b === "void" ? undefined : isOptional(b) ? b : b === "json" ? "json" : ({ optional: b as Type } as T);
  if (b === "null") return join(b, a);
  if (isOptional(a) || isOptional(b)) {
    const inner = join(nonNull(a), nonNull(b));
    return inner === undefined ? undefined : inner === "any" ? "any" : isOptional(inner) ? inner : ({ optional: inner as Type } as T);
  }
  if (a === "json" || b === "json") return "json";
  if (isEnum(a) && isEnum(b)) {
    if (baseOf(a) !== baseOf(b)) return undefined;
    return { enum: [...new Set([...a.enum, ...b.enum])] };
  }
  if (isEnum(a) || isEnum(b)) {
    const base = baseOf(isEnum(a) ? a : b);
    const other = isEnum(a) ? b : a;
    return other === base ? other : undefined;
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a.record), ...Object.keys(b.record)]);
    const fields: Record<string, Type> = {};
    for (const key of keys) {
      const joined = join(a.record[key] ?? "null", b.record[key] ?? "null");
      if (joined === undefined || joined === "void" || joined === "temporal") return undefined;
      fields[key] = (joined === "any" || joined === "null" ? "json" : joined) as Type;
    }
    return { record: fields };
  }
  if (isList(a) && isList(b)) return wrap(join(a.list, b.list), (t) => ({ list: t }));
  if (isSet(a) && isSet(b)) return wrap(join(a.set, b.set), (t) => ({ set: t }));
  if (isMap(a) && isMap(b)) {
    const k = join(a.map[0], b.map[0]);
    const v = join(a.map[1], b.map[1]);
    return k === undefined || v === undefined ? undefined : ({ map: [k as Type, v as Type] } as T);
  }
  return undefined;
}
const wrap = (inner: T | undefined, make: (t: Type) => T): T | undefined => (inner === undefined ? undefined : make(inner as Type));

/** Whether a value of type `value` can be put where `target` is expected. */
export function fits(value: T, target: T): boolean {
  if (value === "any" || target === "any") return true;
  if (target === "json") return value !== "void" && value !== "temporal";
  if (value === "null") return isOptional(target);
  if (isOptional(target)) return isOptional(value) ? fits(value.optional, target.optional) : fits(value, target.optional);
  if (isOptional(value)) return false;
  if (isEnum(target)) return isEnum(value) && value.enum.every((v) => target.enum.includes(v));
  if (isEnum(value)) return baseOf(value) === target;
  if (isRecord(target)) return isRecord(value) && Object.keys(target.record).every((k) => fits(value.record[k] ?? "null", target.record[k])) && Object.keys(value.record).every((k) => k in target.record);
  if (isList(target)) return isList(value) && fits(value.list, target.list);
  if (isSet(target)) return isSet(value) && fits(value.set, target.set);
  if (isMap(target)) return isMap(value) && fits(value.map[0], target.map[0]) && fits(value.map[1], target.map[1]);
  return same(value, target);
}

/** A type that can go into the IR (no `any` left inside); `any` becomes `json`. */
export function concrete(t: T): Type {
  if (t === "any" || t === "null" || t === "void" || t === "temporal") return "json";
  if (typeof t === "string") return t;
  if (isOptional(t)) return { optional: concrete(t.optional) };
  if (isRecord(t)) return { record: Object.fromEntries(Object.entries(t.record).map(([k, v]) => [k, concrete(v)])) };
  if (isList(t)) return { list: concrete(t.list) };
  if (isSet(t)) return { set: concrete(t.set) };
  if (isMap(t)) return { map: [concrete(t.map[0]), concrete(t.map[1])] };
  return t;
}
