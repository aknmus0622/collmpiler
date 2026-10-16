import type { FieldSchema, Fields } from "@clp/core";

// フィールドの型 (FieldSchema) に関する実行時の判定

type ObjectSchema = Exclude<FieldSchema, string | readonly (string | number)[]>;
const isObject = (schema: FieldSchema): schema is ObjectSchema => typeof schema === "object" && !Array.isArray(schema);
export const isEnum = (schema: FieldSchema): schema is readonly (string | number)[] => Array.isArray(schema);
// 文字列だけの列挙（セルフホストした payload-check が扱えるもの）
export const isStringEnum = (schema: FieldSchema): schema is readonly string[] => isEnum(schema) && schema.every((member) => typeof member === "string");
export const isNumberSchema = (schema: FieldSchema): schema is Extract<FieldSchema, { type: "integer" | "number" }> =>
  isObject(schema) && "type" in schema && schema.type !== "string";
export const isStringSchema = (schema: FieldSchema): schema is Extract<FieldSchema, { type: "string" }> =>
  isObject(schema) && "type" in schema && schema.type === "string";
export const isList = (schema: FieldSchema): schema is { list: FieldSchema } => isObject(schema) && "list" in schema;
export const isRecord = (schema: FieldSchema): schema is { record: Fields; optional?: readonly string[] } => isObject(schema) && "record" in schema;
export const isOptional = (schema: FieldSchema): schema is { optional: FieldSchema } => isObject(schema) && "optional" in schema && !("record" in schema);
export const isOneOf = (schema: FieldSchema): schema is { oneOf: Fields } => isObject(schema) && "oneOf" in schema;
// 構造を持つ型（並び、フィールドの組、無いことがある値、どれか1つの形、何でも入る値、数の列挙）。
// セルフホストした payload-check は、平らな値（文字列の列挙まで）だけを扱う
export const isStructured = (schema: FieldSchema): boolean =>
  isList(schema) || isRecord(schema) || isOptional(schema) || isOneOf(schema) || schema === "value" || (isEnum(schema) && !isStringEnum(schema));

// 何でも入る値: null、真偽値、有限の数、文字列、それらの並びとフィールドの組
const isValue = (value: unknown): boolean =>
  value === null ||
  typeof value === "boolean" ||
  typeof value === "string" ||
  (typeof value === "number" && Number.isFinite(value)) ||
  (Array.isArray(value) && value.every(isValue)) ||
  (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype && Object.values(value as object).every(isValue));

const numeric = (schema: FieldSchema) =>
  isNumberSchema(schema) ? schema : schema === "integer" || schema === "number" ? { type: schema } : undefined;
// 手がかり（examples、among）を除いた、文字列かどうか
const isString = (schema: FieldSchema) => schema === "string" || isStringSchema(schema);

// 値が、宣言した型と範囲に合っているか
export function conforms(schema: FieldSchema, value: unknown): boolean {
  if (schema === "value") return isValue(value);
  if (isOneOf(schema)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.length === 1 && keys[0] in schema.oneOf && conforms(schema.oneOf[keys[0]], (value as Record<string, unknown>)[keys[0]]);
  }
  if (isOptional(schema)) return value === null || conforms(schema.optional, value);
  if (isList(schema)) return Array.isArray(value) && value.every((item) => conforms(schema.list, item));
  if (isRecord(schema)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const given = value as Record<string, unknown>;
    return (
      Object.keys(given).every((field) => field in schema.record) &&
      Object.entries(schema.record).every(([field, type]) => (given[field] === null ? schema.optional?.includes(field) === true : field in given && conforms(type, given[field])))
    );
  }
  if (isEnum(schema)) return schema.includes(value as string | number);
  if (isString(schema)) return typeof value === "string";
  const number = numeric(schema);
  if (!number) return typeof value === schema;
  const { type, min, max } = number as { type: string; min?: number; max?: number };
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (type !== "integer" || Number.isInteger(value)) &&
    (min === undefined || value >= min) &&
    (max === undefined || value <= max)
  );
}

// from の型の値を、to の型のフィールドに入れてよいか（範囲までは見ない）
export function compatible(from: FieldSchema, to: FieldSchema): boolean {
  if (to === "value") return true;
  if (from === "value") return false;
  if (isOneOf(to)) {
    if (!isOneOf(from)) return false;
    return Object.entries(from.oneOf).every(([variant, type]) => variant in to.oneOf && compatible(type, to.oneOf[variant]));
  }
  if (isOneOf(from)) return false;
  if (isOptional(to)) return compatible(isOptional(from) ? from.optional : from, to.optional);
  if (isOptional(from)) return false;
  if (isList(to)) return isList(from) && compatible(from.list, to.list);
  if (isRecord(to)) {
    if (!isRecord(from)) return false;
    const [given, wanted] = [Object.keys(from.record).sort(), Object.keys(to.record).sort()];
    return (
      given.length === wanted.length &&
      wanted.every((field, index) => given[index] === field && compatible(from.record[field], to.record[field]) && (!from.optional?.includes(field) || to.optional?.includes(field) === true))
    );
  }
  if (isList(from) || isRecord(from)) return false;
  if (isEnum(to)) return isEnum(from) && from.every((value) => to.includes(value));
  const target = numeric(to);
  if (target) {
    // 数の列挙は、その要素がすべて合えば入る
    if (isEnum(from)) return from.every((value) => typeof value === "number" && (target.type === "number" || Number.isInteger(value)));
    const source = numeric(from);
    return source !== undefined && (target.type === "number" || source.type === "integer");
  }
  if (isString(to)) return isString(from) || isStringEnum(from);
  return from === to;
}

export const describe = (schema: FieldSchema): string => {
  if (isOneOf(schema)) return Object.entries(schema.oneOf).map(([variant, type]) => `{ ${variant}: ${describe(type)} }`).join(" | ");
  if (isOptional(schema)) return `${describe(schema.optional)} | null`;
  if (isList(schema)) return `${describe(schema.list)}[]`;
  if (isRecord(schema)) return `{ ${Object.entries(schema.record).map(([field, type]) => `${field}: ${describe(type)}${schema.optional?.includes(field) ? " | null" : ""}`).join(", ")} }`;
  return isEnum(schema) ? schema.map((value) => JSON.stringify(value)).join(" | ") : isObject(schema) ? (schema as { type: string }).type : schema;
};
