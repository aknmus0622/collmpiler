// The syntax of the 1.0 notation: the subset of TypeScript a spec is written in (DSL.md §17.5), read without
// executing anything. Anything outside the subset is an error at its position, so that a body which reads as code a
// person expects to run, but means something else to the framework, cannot be written.
//
// The type checker (tsc) still checks the same files for completion and light errors; this parser only reads them.

import { subsetStage0 } from "./subset.ts";
import type { Refusal } from "./subset.ts";
import { decided } from "./decide.ts";

export type Pos = { file: string; line: number; col: number };

export type TypeNode =
  | { k: "tref"; name: string; args: TypeNode[]; at: Pos }
  | { k: "tlit"; value: string | number | boolean; at: Pos }
  | { k: "tkw"; name: "string" | "number" | "boolean" | "void" | "unknown" | "any" | "undefined" | "never" | "null"; at: Pos }
  | { k: "tunion"; types: TypeNode[]; at: Pos }
  | { k: "tarray"; of: TypeNode; at: Pos }
  | { k: "tobj"; fields: { name: string; type: TypeNode; optional: boolean }[]; at: Pos }
  | { k: "tfn"; params: Param[]; ret: TypeNode; at: Pos };

export type Param = { name: string; type?: TypeNode; at: Pos };

export type Expr =
  | { k: "str"; value: string; at: Pos }
  | { k: "num"; value: number; at: Pos }
  | { k: "bool"; value: boolean; at: Pos }
  | { k: "null"; at: Pos }
  | { k: "tmpl"; quasis: string[]; exprs: Expr[]; at: Pos }
  | { k: "id"; name: string; at: Pos }
  | { k: "this"; at: Pos }
  | { k: "member"; object: Expr; name: string; at: Pos }
  | { k: "index"; object: Expr; index: Expr; at: Pos }
  | { k: "call"; callee: Expr; args: Expr[]; typeArgs: TypeNode[]; at: Pos }
  | { k: "obj"; props: Prop[]; at: Pos }
  | { k: "arr"; items: Expr[]; at: Pos }
  | { k: "spread"; expr: Expr; at: Pos }
  | { k: "arrow"; params: Param[]; body: Expr | Block; ret?: TypeNode; at: Pos }
  | { k: "unary"; op: "!" | "-" | "+"; expr: Expr; at: Pos }
  | { k: "bin"; op: BinOp; left: Expr; right: Expr; at: Pos }
  | { k: "cond"; test: Expr; then: Expr; else: Expr; at: Pos }
  | { k: "as"; expr: Expr; type: TypeNode | "const"; at: Pos }
  | { k: "nonNull"; expr: Expr; at: Pos }
  | { k: "assign"; op: "=" | "+=" | "-="; target: Expr; value: Expr; at: Pos };

export type BinOp = "+" | "-" | "*" | "/" | "%" | "<" | "<=" | ">" | ">=" | "===" | "!==" | "==" | "!=" | "&&" | "||" | "??";

export type Prop =
  | { k: "prop"; key: string; value: Expr; at: Pos }
  | { k: "method"; key: string; params: Param[]; body: Block; ret?: TypeNode; at: Pos }
  | { k: "spread"; expr: Expr; at: Pos };

export type Block = { k: "block"; body: Stmt[]; at: Pos };
export type Stmt =
  | Block
  | { k: "const"; name: string; type?: TypeNode; init: Expr; at: Pos }
  | { k: "if"; test: Expr; then: Stmt; else?: Stmt; at: Pos }
  | { k: "return"; expr?: Expr; at: Pos }
  | { k: "expr"; expr: Expr; at: Pos };

export type Import = { from: string; names: { imported: string; local: string; typeOnly: boolean }[]; at: Pos };
export type Decl =
  | { k: "const"; name: string; exported: boolean; init: Expr; type?: TypeNode; at: Pos }
  | { k: "type"; name: string; exported: boolean; params: string[]; type: TypeNode; at: Pos };
export type Module = { file: string; imports: Import[]; decls: Decl[]; comments: { line: number; text: string }[] };

export class SyntaxError1 extends Error {
  at: Pos;
  constructor(message: string, at: Pos) {
    super(`${at.file}:${at.line}:${at.col}: ${message}`);
    this.name = "SyntaxError";
    this.at = at;
  }
}

// --- Tokens ---

type Tok =
  | { t: "id"; v: string; at: Pos; nl: boolean }
  | { t: "str"; v: string; at: Pos; nl: boolean }
  | { t: "num"; v: number; at: Pos; nl: boolean }
  | { t: "tmpl"; quasis: string[]; exprs: Tok[][]; at: Pos; nl: boolean }
  | { t: "p"; v: string; at: Pos; nl: boolean }
  | { t: "eof"; at: Pos; nl: boolean };

const PUNCT = ["...", "===", "!==", "**=", "&&=", "||=", "??=", "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "+=", "-=", "*=", "/=", "++", "--", "{", "}", "(", ")", "[", "]", ";", ",", ".", "?", ":", "=", "<", ">", "+", "-", "*", "/", "%", "!", "|", "&", "@", "#", "~", "^"];

function tokenize(src: string, file: string, comments: { line: number; text: string }[]): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  let nl = false;
  const pos = (): Pos => ({ file, line, col: i - lineStart + 1 });
  const fail = (message: string): never => {
    throw new SyntaxError1(message, pos());
  };
  const advance = (n = 1) => {
    for (let j = 0; j < n; j++) {
      if (src[i] === "\n") {
        line++;
        lineStart = i + 1;
      }
      i++;
    }
  };
  const readString = (quote: string): string => {
    advance();
    let out = "";
    while (i < src.length && src[i] !== quote) {
      if (src[i] === "\n") fail("文字列が行の終わりで閉じていません");
      if (src[i] === "\\") {
        advance();
        out += escape();
      } else {
        out += src[i];
        advance();
      }
    }
    if (i >= src.length) fail("文字列が閉じていません");
    advance();
    return out;
  };
  const escape = (): string => {
    const c = src[i];
    advance();
    switch (c) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "0": return "\0";
      case "b": return "\b";
      case "f": return "\f";
      case "v": return "\v";
      case "\n": return "";
      case "u": {
        if (src[i] === "{") {
          const end = src.indexOf("}", i);
          const code = Number.parseInt(src.slice(i + 1, end), 16);
          advance(end - i + 1);
          return String.fromCodePoint(code);
        }
        const code = Number.parseInt(src.slice(i, i + 4), 16);
        advance(4);
        return String.fromCharCode(code);
      }
      case "x": {
        const code = Number.parseInt(src.slice(i, i + 2), 16);
        advance(2);
        return String.fromCharCode(code);
      }
      default: return c;
    }
  };
  // The tokens of a template literal: its constant parts, and the tokens of each `${...}`
  const readTemplate = (): Tok => {
    const at = pos();
    advance();
    const quasis: string[] = [];
    const exprs: Tok[][] = [];
    let current = "";
    while (true) {
      if (i >= src.length) fail("テンプレート文字列が閉じていません");
      if (src[i] === "`") {
        advance();
        quasis.push(current);
        break;
      }
      if (src[i] === "\\") {
        advance();
        current += escape();
        continue;
      }
      if (src[i] === "$" && src[i + 1] === "{") {
        advance(2);
        quasis.push(current);
        current = "";
        // the tokens up to the matching `}`
        const inner: Tok[] = [];
        let depth = 0;
        while (true) {
          const tok = next();
          if (tok.t === "eof") fail("テンプレート文字列の ${ が閉じていません");
          if (tok.t === "p" && tok.v === "{") depth++;
          if (tok.t === "p" && tok.v === "}") {
            if (depth === 0) break;
            depth--;
          }
          inner.push(tok);
        }
        inner.push({ t: "eof", at: pos(), nl: false });
        exprs.push(inner);
        continue;
      }
      current += src[i];
      advance();
    }
    return { t: "tmpl", quasis, exprs, at, nl: false };
  };
  function next(): Tok {
    // whitespace and comments
    while (i < src.length) {
      const c = src[i];
      if (c === "\n") {
        nl = true;
        advance();
      } else if (c === " " || c === "\t" || c === "\r" || c === "﻿") advance();
      else if (c === "/" && src[i + 1] === "/") {
        const end = src.indexOf("\n", i);
        const stop = end < 0 ? src.length : end;
        comments.push({ line, text: src.slice(i + 2, stop).trim() });
        advance(stop - i);
      } else if (c === "/" && src[i + 1] === "*") {
        const end = src.indexOf("*/", i + 2);
        if (end < 0) fail("コメントが閉じていません");
        advance(end + 2 - i);
      } else break;
    }
    const sawNewline = nl;
    nl = false;
    const at = pos();
    if (i >= src.length) return { t: "eof", at, nl: sawNewline };
    const c = src[i];
    if (/[\p{ID_Start}$_]/u.test(c)) {
      let v = "";
      while (i < src.length && /[\p{ID_Continue}$_‌‍]/u.test(src[i])) {
        v += src[i];
        advance();
      }
      return { t: "id", v, at, nl: sawNewline };
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const match = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:[0-9][0-9_]*)?(?:\.[0-9_]+)?(?:[eE][+-]?[0-9]+)?)/.exec(src.slice(i));
      const text = match![0];
      advance(text.length);
      if (src[i] === "n") fail("BigInt は書けません");
      return { t: "num", v: Number(text.replaceAll("_", "")), at, nl: sawNewline };
    }
    if (c === '"' || c === "'") return { t: "str", v: readString(c), at, nl: sawNewline };
    if (c === "`") return { ...readTemplate(), nl: sawNewline };
    for (const p of PUNCT) {
      if (src.startsWith(p, i)) {
        advance(p.length);
        return { t: "p", v: p, at, nl: sawNewline };
      }
    }
    return fail(`読めない文字です: ${JSON.stringify(c)}`);
  }
  while (true) {
    const tok = next();
    toks.push(tok);
    if (tok.t === "eof") break;
  }
  return toks;
}

// --- Parser ---

const KEYWORD_TYPES = new Set(["string", "number", "boolean", "void", "unknown", "any", "undefined", "never", "null"]);
// Statements and expressions that read as code but are outside the subset (DSL.md §17.5)
const MESSAGES: Record<Exclude<Refusal, "allowed">, string> = {
  loop: "ループは書けません。some / every / count / filter / map を使ってください",
  let: "let / var は書けません。値は const で一度だけ名前を付けます",
  exception: "例外は書けません。断ることは、答えの1つとして return します",
  switch: "switch は書けません。if を上から順に書きます",
  function: "関数の宣言は書けません。名前を付けた条件・計算 (condition / calc) を使ってください",
  class: "class は書けません",
  async: "非同期は書けません",
  generator: "ジェネレーターは書けません",
  new: "new は書けません",
  delete: "delete 演算子は書けません。Map / Set の delete(…) を使ってください",
  typeof: "typeof は書けません",
  in: "in / instanceof は書けません。has(…) を使ってください",
  jump: "break / continue は書けません",
};
/** Why a word cannot be written, or undefined when it can (syntax-check decides). */
function refused(word: string): string | undefined {
  const decision = decided("syntax-check", { word }, subsetStage0(word));
  return decision === "allowed" ? undefined : MESSAGES[decision];
}

class Parser {
  private toks: Tok[];
  private i = 0;
  private file: string;
  constructor(toks: Tok[], file: string) {
    this.toks = toks;
    this.file = file;
  }
  private get tok(): Tok {
    return this.toks[this.i];
  }
  private peek(n = 1): Tok {
    return this.toks[Math.min(this.i + n, this.toks.length - 1)];
  }
  private fail(message: string, at: Pos = this.tok.at): never {
    throw new SyntaxError1(message, at);
  }
  private is(v: string): boolean {
    const t = this.tok;
    return (t.t === "p" || t.t === "id") && t.v === v;
  }
  private eat(v: string): boolean {
    if (this.is(v)) {
      this.i++;
      return true;
    }
    return false;
  }
  private expect(v: string): Tok {
    if (!this.is(v)) this.fail(`"${v}" が要ります (${this.describe(this.tok)} があります)`);
    return this.toks[this.i++];
  }
  private describe(tok: Tok): string {
    if (tok.t === "eof") return "ファイルの終わり";
    if (tok.t === "tmpl") return "テンプレート文字列";
    return JSON.stringify(String(tok.v));
  }
  private ident(): string {
    const t = this.tok;
    if (t.t !== "id") this.fail(`名前が要ります (${this.describe(t)} があります)`);
    this.i++;
    return t.v;
  }
  private semi() {
    if (this.eat(";")) return;
    // automatic semicolon insertion: a newline, `}` or the end
    if (this.tok.nl || this.is("}") || this.tok.t === "eof") return;
    this.fail(`";" が要ります (${this.describe(this.tok)} があります)`);
  }
  private try<T>(fn: () => T): T | undefined {
    const start = this.i;
    try {
      return fn();
    } catch (error) {
      if (!(error instanceof SyntaxError1)) throw error;
      this.i = start;
      return undefined;
    }
  }

  module(comments: { line: number; text: string }[]): Module {
    const imports: Import[] = [];
    const decls: Decl[] = [];
    while (this.tok.t !== "eof") {
      const at = this.tok.at;
      if (this.is("import")) {
        imports.push(this.importDecl());
        continue;
      }
      const exported = this.eat("export");
      if (this.is("const")) {
        this.i++;
        const name = this.ident();
        const type = this.eat(":") ? this.type() : undefined;
        this.expect("=");
        const init = this.expr();
        this.semi();
        decls.push({ k: "const", name, exported, init, type, at });
        continue;
      }
      if (this.is("type")) {
        this.i++;
        const name = this.ident();
        const params: string[] = [];
        if (this.eat("<")) {
          do params.push(this.ident());
          while (this.eat(","));
          this.expect(">");
        }
        this.expect("=");
        const type = this.type();
        this.semi();
        decls.push({ k: "type", name, exported, params, type, at });
        continue;
      }
      if (this.is("interface")) this.fail("interface は書けません。type で書いてください");
      const word = this.tok.t === "id" ? refused(this.tok.v) : undefined;
      this.fail(word ?? "ファイルの最上位に書けるのは、import と、const と type の宣言だけです");
    }
    return { file: this.file, imports, decls, comments };
  }

  private importDecl(): Import {
    const at = this.tok.at;
    this.expect("import");
    const allType = this.is("type") && this.peek().t === "p" && (this.peek() as { v: string }).v === "{" ? (this.i++, true) : false;
    const names: Import["names"] = [];
    if (this.eat("{")) {
      while (!this.is("}")) {
        const typeOnly = allType || (this.is("type") && this.peek().t === "id" ? (this.i++, true) : false);
        const imported = this.ident();
        const local = this.eat("as") ? this.ident() : imported;
        names.push({ imported, local, typeOnly });
        if (!this.eat(",")) break;
      }
      this.expect("}");
    } else if (this.eat("*")) {
      this.expect("as");
      names.push({ imported: "*", local: this.ident(), typeOnly: allType });
    } else this.fail("import は { … } の形で書いてください");
    this.expect("from");
    const from = this.tok;
    if (from.t !== "str") this.fail("import の from には文字列が要ります");
    this.i++;
    this.semi();
    return { from: (from as { v: string }).v, names, at };
  }

  // --- Types ---

  type(): TypeNode {
    const at = this.tok.at;
    this.eat("|");
    const types = [this.typeAtom()];
    while (this.eat("|")) types.push(this.typeAtom());
    if (this.is("&")) this.fail("型の交差 (&) は書けません");
    return types.length === 1 ? types[0] : { k: "tunion", types, at };
  }
  private typeAtom(): TypeNode {
    const at = this.tok.at;
    let type: TypeNode;
    const t = this.tok;
    if (this.eat("readonly")) return this.typeAtom();
    if (t.t === "str") {
      this.i++;
      type = { k: "tlit", value: t.v, at };
    } else if (t.t === "num") {
      this.i++;
      type = { k: "tlit", value: t.v, at };
    } else if (this.is("-") && this.peek().t === "num") {
      this.i++;
      const n = this.tok as { v: number };
      this.i++;
      type = { k: "tlit", value: -n.v, at };
    } else if (this.is("true") || this.is("false")) {
      type = { k: "tlit", value: this.tok.t === "id" && this.tok.v === "true", at };
      this.i++;
    } else if (t.t === "id" && KEYWORD_TYPES.has(t.v)) {
      this.i++;
      type = { k: "tkw", name: t.v as "string", at };
    } else if (this.is("{")) {
      type = this.objectType();
    } else if (this.is("(")) {
      // a function type or a parenthesized type
      const fn = this.try(() => this.fnType());
      if (fn) type = fn;
      else {
        this.expect("(");
        type = this.type();
        this.expect(")");
      }
    } else if (t.t === "id") {
      let name = this.ident();
      while (this.is(".") && this.peek().t === "id") {
        this.i++;
        name += `.${this.ident()}`;
      }
      const args: TypeNode[] = [];
      if (this.eat("<")) {
        do args.push(this.type());
        while (this.eat(","));
        this.expect(">");
      }
      type = { k: "tref", name, args, at };
    } else return this.fail(`型が要ります (${this.describe(t)} があります)`);
    while (this.is("[") && this.peek().t === "p" && (this.peek() as { v: string }).v === "]") {
      this.i += 2;
      type = { k: "tarray", of: type, at };
    }
    return type;
  }
  private objectType(): TypeNode {
    const at = this.tok.at;
    this.expect("{");
    const fields: { name: string; type: TypeNode; optional: boolean }[] = [];
    while (!this.is("}")) {
      this.eat("readonly");
      const t = this.tok;
      const name = t.t === "str" ? (this.i++, t.v) : this.ident();
      const optional = this.eat("?");
      this.expect(":");
      fields.push({ name, type: this.type(), optional });
      if (!this.eat(";") && !this.eat(",")) break;
    }
    this.expect("}");
    return { k: "tobj", fields, at };
  }
  private fnType(): TypeNode {
    const at = this.tok.at;
    const params = this.params();
    this.expect("=>");
    return { k: "tfn", params, ret: this.type(), at };
  }
  private params(): Param[] {
    this.expect("(");
    const params: Param[] = [];
    while (!this.is(")")) {
      const at = this.tok.at;
      if (this.is("{") || this.is("[")) this.fail("引数の分割代入は書けません");
      if (this.is("...")) this.fail("残りの引数 (...) は書けません");
      const name = this.ident();
      this.eat("?");
      const type = this.eat(":") ? this.type() : undefined;
      if (this.is("=")) this.fail("引数の既定値は書けません");
      params.push({ name, type, at });
      if (!this.eat(",")) break;
    }
    this.expect(")");
    return params;
  }

  // --- Statements ---

  block(): Block {
    const at = this.tok.at;
    this.expect("{");
    const body: Stmt[] = [];
    while (!this.is("}")) {
      if (this.tok.t === "eof") this.fail("ブロックが閉じていません");
      body.push(this.stmt());
    }
    this.expect("}");
    return { k: "block", body, at };
  }
  private stmt(): Stmt {
    const at = this.tok.at;
    const t = this.tok;
    if (this.is("{")) return this.block();
    if (this.eat(";")) return { k: "block", body: [], at };
    if (t.t === "id") {
      const refusal = t.v === "delete" && this.peek().t === "p" ? undefined : refused(t.v);
      if (refusal) this.fail(refusal);
      if (t.v === "const") {
        this.i++;
        if (this.is("{") || this.is("[")) this.fail("分割代入は書けません。const で1つずつ名前を付けます");
        const name = this.ident();
        const type = this.eat(":") ? this.type() : undefined;
        this.expect("=");
        const init = this.expr();
        this.semi();
        return { k: "const", name, type, init, at };
      }
      if (t.v === "if") {
        this.i++;
        this.expect("(");
        const test = this.expr();
        this.expect(")");
        const then = this.stmt();
        const otherwise = this.eat("else") ? this.stmt() : undefined;
        return { k: "if", test, then, else: otherwise, at };
      }
      if (t.v === "return") {
        this.i++;
        if (this.is(";") || this.is("}") || this.tok.nl) {
          this.eat(";");
          return { k: "return", at };
        }
        const expr = this.expr();
        this.semi();
        return { k: "return", expr, at };
      }
    }
    const expr = this.assignment();
    this.semi();
    return { k: "expr", expr, at };
  }
  private assignment(): Expr {
    const at = this.tok.at;
    const target = this.expr();
    for (const op of ["=", "+=", "-="] as const) {
      if (this.eat(op)) return { k: "assign", op, target, value: this.expr(), at };
    }
    if (this.is("++") || this.is("--") || this.is("*=") || this.is("/=") || this.is("??=") || this.is("&&=") || this.is("||=")) {
      this.fail(`${(this.tok as { v: string }).v} は書けません。this.x = … か += / -= で書きます`);
    }
    return target;
  }

  // --- Expressions ---

  expr(): Expr {
    return this.conditional();
  }
  private conditional(): Expr {
    const at = this.tok.at;
    const test = this.binary(0);
    if (this.eat("?")) {
      const then = this.expr();
      this.expect(":");
      const otherwise = this.expr();
      return { k: "cond", test, then, else: otherwise, at };
    }
    return test;
  }
  private static PRECEDENCE: Record<string, number> = {
    "??": 1, "||": 2, "&&": 3, "==": 4, "!=": 4, "===": 4, "!==": 4, "<": 5, "<=": 5, ">": 5, ">=": 5, "+": 6, "-": 6, "*": 7, "/": 7, "%": 7,
  };
  private binary(min: number): Expr {
    let left = this.unary();
    while (true) {
      const t = this.tok;
      if (t.t === "id" && (t.v === "as" || t.v === "satisfies") && !t.nl) {
        this.i++;
        if (t.v === "satisfies") {
          this.type();
          continue;
        }
        if (this.eat("const")) left = { k: "as", expr: left, type: "const", at: t.at };
        else left = { k: "as", expr: left, type: this.type(), at: t.at };
        continue;
      }
      if (t.t === "id" && (t.v === "in" || t.v === "instanceof")) this.fail(refused(t.v) ?? `${t.v} は書けません`);
      if (t.t !== "p") return left;
      if (t.v === "**") this.fail("** は書けません");
      if (t.v === "|" || t.v === "&" || t.v === "^" || t.v === "~") this.fail("ビット演算は書けません");
      const prec = Parser.PRECEDENCE[t.v];
      if (prec === undefined || prec <= min) return left;
      this.i++;
      const right = this.binary(prec);
      left = { k: "bin", op: t.v as BinOp, left, right, at: t.at };
    }
  }
  private unary(): Expr {
    const at = this.tok.at;
    if (this.eat("!")) return { k: "unary", op: "!", expr: this.unary(), at };
    if (this.eat("-")) return { k: "unary", op: "-", expr: this.unary(), at };
    if (this.eat("+")) return { k: "unary", op: "+", expr: this.unary(), at };
    if (this.is("++") || this.is("--")) this.fail("++ / -- は書けません");
    if (this.tok.t === "id" && (this.tok.v === "typeof" || this.tok.v === "await" || this.tok.v === "new" || this.tok.v === "void" || this.tok.v === "delete")) {
      this.fail(refused(this.tok.v) ?? `${this.tok.v} は書けません`);
    }
    return this.postfix(this.primary());
  }
  private postfix(expr: Expr): Expr {
    while (true) {
      const at = this.tok.at;
      if (this.is("?.")) this.fail("?. は書けません。値が無いことがある所は、has(…) で確かめてから読みます");
      if (this.eat(".")) {
        const t = this.tok;
        if (t.t !== "id") this.fail("「.」のあとに名前が要ります");
        this.i++;
        expr = { k: "member", object: expr, name: t.v, at };
        continue;
      }
      if (this.is("[") && !this.tok.nl) {
        this.i++;
        const index = this.expr();
        this.expect("]");
        expr = { k: "index", object: expr, index, at };
        continue;
      }
      if (this.is("!") && !this.tok.nl && !(this.peek().t === "p" && (this.peek() as { v: string }).v === "=")) {
        // a non-null assertion: the value is never null here (if it is, the spec is wrong)
        this.i++;
        expr = { k: "nonNull", expr, at };
        continue;
      }
      if (this.is("<")) {
        const typeArgs = this.try(() => {
          this.expect("<");
          const args: TypeNode[] = [];
          do args.push(this.type());
          while (this.eat(","));
          this.expect(">");
          if (!this.is("(")) this.fail("not a call");
          return args;
        });
        if (typeArgs) {
          expr = { k: "call", callee: expr, args: this.args(), typeArgs, at };
          continue;
        }
        return expr;
      }
      if (this.is("(") && !this.tok.nl) {
        expr = { k: "call", callee: expr, args: this.args(), typeArgs: [], at };
        continue;
      }
      if (this.tok.t === "tmpl" && !this.tok.nl) this.fail("タグ付きテンプレートは書けません");
      return expr;
    }
  }
  private args(): Expr[] {
    this.expect("(");
    const args: Expr[] = [];
    while (!this.is(")")) {
      if (this.is("...")) {
        const at = this.tok.at;
        this.i++;
        args.push({ k: "spread", expr: this.expr(), at });
      } else args.push(this.expr());
      if (!this.eat(",")) break;
    }
    this.expect(")");
    return args;
  }
  private primary(): Expr {
    const t = this.tok;
    const at = t.at;
    if (t.t === "str") {
      this.i++;
      return { k: "str", value: t.v, at };
    }
    if (t.t === "num") {
      this.i++;
      return { k: "num", value: t.v, at };
    }
    if (t.t === "tmpl") {
      this.i++;
      const exprs = t.exprs.map((toks) => {
        const inner = new Parser(toks, this.file);
        const expr = inner.expr();
        if (inner.tok.t !== "eof") inner.fail("${ … } の中には、式を1つだけ書きます");
        return expr;
      });
      return { k: "tmpl", quasis: t.quasis, exprs, at };
    }
    if (t.t === "p") {
      if (t.v === "(") {
        // an arrow function, or a parenthesized expression
        // an arrow function, once its parameters and `=>` are read (errors in its body are not backtracked over)
        const head = this.try(() => {
          const params = this.params();
          const ret = this.eat(":") ? this.type() : undefined;
          this.expect("=>");
          return { params, ret };
        });
        if (head) return { k: "arrow", params: head.params, body: this.arrowBody(), ret: head.ret, at };
        this.i++;
        const expr = this.expr();
        this.expect(")");
        return expr;
      }
      if (t.v === "[") return this.array();
      if (t.v === "{") return this.object();
      if (t.v === "/") this.fail("正規表現は書けません");
      if (t.v === "<") this.fail("型の表明 <T> は書けません");
      return this.fail(`式が要ります (${this.describe(t)} があります)`);
    }
    if (t.t === "id") {
      if (t.v === "true" || t.v === "false") {
        this.i++;
        return { k: "bool", value: t.v === "true", at };
      }
      if (t.v === "null") {
        this.i++;
        return { k: "null", at };
      }
      if (t.v === "undefined") this.fail("undefined は書けません。無いことは null で書きます");
      if (t.v === "this") {
        this.i++;
        return { k: "this", at };
      }
      if (t.v === "function") this.fail("function は書けません。アロー関数 (x) => … を使ってください");
      const refusal = t.v === "delete" ? undefined : refused(t.v);
      if (refusal) this.fail(refusal);
      // a single-parameter arrow function: x => …
      if (this.peek().t === "p" && (this.peek() as { v: string }).v === "=>") {
        this.i++;
        this.i++;
        return { k: "arrow", params: [{ name: t.v, at }], body: this.arrowBody(), at };
      }
      this.i++;
      return { k: "id", name: t.v, at };
    }
    return this.fail(`式が要ります (${this.describe(t)} があります)`);
  }
  private arrow(): Expr {
    const at = this.tok.at;
    const params = this.params();
    const ret = this.eat(":") ? this.type() : undefined;
    this.expect("=>");
    return { k: "arrow", params, body: this.arrowBody(), ret, at };
  }
  private arrowBody(): Expr | Block {
    if (this.is("{")) return this.block();
    return this.expr();
  }
  private array(): Expr {
    const at = this.tok.at;
    this.expect("[");
    const items: Expr[] = [];
    while (!this.is("]")) {
      if (this.is(",")) this.fail("配列の空きは書けません");
      if (this.is("...")) {
        const sat = this.tok.at;
        this.i++;
        items.push({ k: "spread", expr: this.expr(), at: sat });
      } else items.push(this.expr());
      if (!this.eat(",")) break;
    }
    this.expect("]");
    return { k: "arr", items, at };
  }
  private object(): Expr {
    const at = this.tok.at;
    this.expect("{");
    const props: Prop[] = [];
    while (!this.is("}")) {
      const pat = this.tok.at;
      if (this.is("...")) {
        this.i++;
        props.push({ k: "spread", expr: this.expr(), at: pat });
      } else {
        if (this.is("get") || this.is("set") || this.is("async")) {
          const following = this.peek();
          if (following.t === "id" || following.t === "str") this.fail(`${(this.tok as { v: string }).v} の付いたメソッドは書けません`);
        }
        if (this.is("[")) this.fail("計算されたキー [ … ] は書けません");
        const t = this.tok;
        let key: string;
        if (t.t === "id" || t.t === "str") key = String(t.v);
        else if (t.t === "num") key = String(t.v);
        else this.fail(`キーが要ります (${this.describe(t)} があります)`);
        this.i++;
        if (this.is("(") || this.is("<")) {
          if (this.is("<")) this.fail("型引数を持つメソッドは書けません");
          const params = this.params();
          const ret = this.eat(":") ? this.type() : undefined;
          props.push({ k: "method", key, params, body: this.block(), ret, at: pat });
        } else if (this.eat(":")) props.push({ k: "prop", key, value: this.expr(), at: pat });
        else {
          if (t.t !== "id") this.fail("キーのあとに「:」が要ります");
          props.push({ k: "prop", key, value: { k: "id", name: key, at: pat }, at: pat });
        }
      }
      if (!this.eat(",")) break;
    }
    this.expect("}");
    return { k: "obj", props, at };
  }
}

/** Reads one file of a spec. Throws SyntaxError1 (with its position) for anything outside the subset. */
export function parseModule(src: string, file: string): Module {
  const comments: { line: number; text: string }[] = [];
  const parser = new Parser(tokenize(src, file, comments), file);
  return parser.module(comments);
}
