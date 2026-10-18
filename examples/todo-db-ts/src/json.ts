/**
 * Any value that can be written as JSON: `null`, a boolean, a number, a string, an array of JSON values,
 * or an object whose properties are JSON values.
 *
 * Corresponds to the specification type `value`.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [property: string]: JsonValue };
