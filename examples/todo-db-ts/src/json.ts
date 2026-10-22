/**
 * Any JSON value: what the specification calls `json`. `null` is a value like any other.
 */
export type Json = null | boolean | number | string | Json[] | { [field: string]: Json };
