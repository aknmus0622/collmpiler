// The stamp of an interpretation: the hash of the Layer 1 it was derived from. When Layer 1 changes, the
// interpretation is stale and stops everything until it is derived again (`clp interpret`).
//
// The hash covers the unit's own declaration and every Layer 1 declaration it reaches by name (types, constants,
// other components), without positions or comments. The constants in the rows of a decision table are left out:
// they reach the IR without passing through the interpretation, so changing one needs no new interpretation.

import { createHash } from "node:crypto";
import { Names } from "./read.ts";
import type { Program, Unit } from "./read.ts";
import type { Decl, Module } from "./syntax.ts";

const INTERPRETATION_FILE = /\.interpretation(\.draft)?\.ts$/;

function strip(value: unknown, inRow = false): unknown {
  if (Array.isArray(value)) return value.map((v) => strip(v, inRow));
  if (typeof value !== "object" || value === null) return value;
  const node = value as Record<string, unknown>;
  // a constant in a decision row: only its kind counts
  if (inRow && (node.k === "num" || node.k === "str" || node.k === "bool" || node.k === "null")) return { k: node.k };
  return Object.fromEntries(Object.entries(node).filter(([key]) => key !== "at").map(([key, v]) => [key, strip(v, inRow)]));
}

export function layer1Hash(unit: Unit, program: Program): string {
  const names = new Names(program.modules);
  const seen = new Set<string>();
  const parts: unknown[] = [];
  const visitDecl = (decl: Decl, module: Module) => {
    const key = `${module.file}#${decl.name}`;
    if (seen.has(key) || INTERPRETATION_FILE.test(module.file)) return;
    seen.add(key);
    const isDecisions = decl.k === "const" && decl.init.k === "call" && decl.init.callee.k === "id" && names.resolve(module, decl.init.callee.name).k === "core" && decl.init.callee.name === "decisions";
    const body = isDecisions && decl.k === "const" && decl.init.k === "call" ? { ...decl, init: { ...decl.init, args: decl.init.args.map((a, i) => (i === 1 ? strip(a, true) : a)) } } : decl;
    parts.push([decl.name, strip(body)]);
    // follow the names it uses
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== "object" || node === null) return;
      const n = node as Record<string, unknown>;
      if ((n.k === "id" || n.k === "tref") && typeof n.name === "string") {
        const sym = names.resolve(module, (n.name as string).split(".")[0]);
        if (sym.k === "const" || sym.k === "type") visitDecl(sym.decl, sym.module);
      }
      Object.values(n).forEach(walk);
    };
    walk(decl);
  };
  const decl = unit.module.decls.find((d) => d.name === unit.exportName);
  if (decl) visitDecl(decl, unit.module);
  return `sha256:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}

/** Whether Layer 1 left something for an interpretation to write (prose, or a fragment with only its sentence). */
export function hasProse(unit: Unit): boolean {
  if (unit.proseOnly) return true;
  for (const entry of unit.entries.values()) if (entry.layer === 1 && entry.prose !== undefined) return true;
  // fragments written with only their sentence: is.x("…") / does.x("…")
  const decl = unit.module.decls.find((d) => d.name === unit.exportName);
  let found = false;
  const walk = (node: unknown) => {
    if (found || typeof node !== "object" || node === null) return;
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as Record<string, unknown>;
    if (n.k === "call") {
      const callee = n.callee as Record<string, unknown>;
      const args = n.args as unknown[];
      if (callee.k === "member" && (callee.object as Record<string, unknown>).k === "id") {
        const object = (callee.object as { name: string }).name;
        if (((object === "is" || object === "value") && args.length === 1) || object === "does") found = true;
      }
    }
    Object.values(n).forEach(walk);
  };
  walk(decl);
  return found;
}
