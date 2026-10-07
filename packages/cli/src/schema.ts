import type { FieldSchema } from "@aac/core";

// フィールドの型 (FieldSchema) に関する実行時の判定

export const isNumberSchema = (schema: FieldSchema): schema is Extract<FieldSchema, { type: string }> =>
  typeof schema === "object" && !Array.isArray(schema);
export const isEnum = (schema: FieldSchema): schema is readonly string[] => Array.isArray(schema);

const numeric = (schema: FieldSchema) =>
  isNumberSchema(schema) ? schema : schema === "integer" || schema === "number" ? { type: schema } : undefined;

// 値が、宣言した型と範囲に合っているか
export function conforms(schema: FieldSchema, value: unknown): boolean {
  if (isEnum(schema)) return schema.includes(value as string);
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
  if (isEnum(to)) return isEnum(from) && from.every((value) => to.includes(value));
  const target = numeric(to);
  if (target) {
    const source = numeric(from);
    return source !== undefined && (target.type === "number" || source.type === "integer");
  }
  if (to === "string") return from === "string" || isEnum(from);
  return from === to;
}

export const describe = (schema: FieldSchema): string =>
  isEnum(schema) ? schema.map((value) => JSON.stringify(value)).join(" | ") : isNumberSchema(schema) ? schema.type : schema;
