import { readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import type { Violation } from "./check.ts";
import type { Ir } from "./generate.ts";
import { literalsOf, scan } from "./scan.ts";

// ミューテーションのゲート: 本番コードをわざと壊し、PBT が落ちることを確かめる。
// 目的はテストの質の評価ではなく、「検証結果が本当に本番コードで決まっているか」の判定
// （アダプターが業務上の判断を肩代わりしていないか）。
//
// 壊し方は Strategy として差し替えられるが、合否の基準 (judge) はゲートが持つ。

export type DecisionValue = string | number;

export type Mutant = {
  file: string;
  line: number;
  original: string;
  mutated: string;
  // IR の決定表に出てくる値を壊した場合、その値
  value?: DecisionValue;
  // PBT が落ちた (= 変異を検出した) か
  killed: boolean;
};

export type MutationReport = { strategy: string; mutants: Mutant[] };

export type MutationInput = {
  // 出力先のルートと、壊す対象 (本番コード) のファイル (ルートからの相対パス)
  root: string;
  files: string[];
  values: DecisionValue[];
  // 現在のファイルの状態で PBT を実行し、合格したら true
  test: () => boolean;
};

export interface MutationStrategy {
  name: string;
  run(input: MutationInput): MutationReport | Promise<MutationReport>;
}

// 決定表の出力に現れる値（割引率、クーポン種別など）。業務上の判断の結果そのもの
export function decisionValues(ir: Ir): DecisionValue[] {
  const values = new Set<DecisionValue>();
  const walk = (node: unknown) => {
    if (typeof node === "number" || typeof node === "string") values.add(node);
    else if (typeof node === "object" && node !== null) Object.values(node).forEach(walk);
  };
  for (const decision of Object.values(ir.decisions)) Object.values(decision.rows).forEach(walk);
  return [...values];
}

// 型を空白に置換してからトークン化するので、型の中のリテラルは対象にならず、位置は元のソースと一致する
function runtimeLiterals(source: string) {
  return literalsOf(scan(stripTypeScriptTypes(source, { mode: "strip" })));
}

const valueOf = (token: { kind: string; text: string }): DecisionValue | boolean =>
  token.kind === "number" ? Number(token.text.replaceAll("_", "")) : token.kind === "word" ? token.text === "true" : token.text;

// 自前の Strategy: 本番コードのリテラルを1つずつ変える（数値は +1、文字列は末尾に文字を足す、真偽値は反転）
export const builtinMutation: MutationStrategy = {
  name: "builtin",
  run({ root, files, values, test }) {
    const targets = new Set(values);
    const mutants: Mutant[] = [];

    for (const file of files.filter((name) => name.endsWith(".ts")).sort()) {
      const path = join(root, file);
      const source = readFileSync(path, "utf8");
      for (const token of runtimeLiterals(source)) {
        const value = valueOf(token);
        const isTarget = typeof value !== "boolean" && targets.has(value);
        // 文字列は決定表の値だけを壊す（それ以外の文字列は型や識別のためのものが多く、判定に使えない）
        if (token.kind === "string" && !isTarget) continue;
        const original = source.slice(token.start, token.end);
        const mutated =
          token.kind === "number" ? `(${original}+1)` : token.kind === "word" ? String(!value) : JSON.stringify(`${value}~`);
        let killed: boolean;
        try {
          writeFileSync(path, source.slice(0, token.start) + mutated + source.slice(token.end));
          killed = !test();
        } finally {
          writeFileSync(path, source);
        }
        mutants.push({
          file,
          line: source.slice(0, token.start).split("\n").length,
          original,
          mutated,
          ...(isTarget ? { value } : {}),
          killed,
        });
      }
    }
    return { strategy: this.name, mutants };
  },
};

export function selectMutation(name: string): MutationStrategy | undefined {
  if (name === "off") return undefined;
  // auto: 環境に軽量なミューテーションツールがあればそれを使い、無ければ自前に落とす。
  // 外部ツールの接続はまだ無いので、現状は常に自前になる。
  if (name === "auto" || name === "builtin") return builtinMutation;
  throw new Error(`未知の mutation strategy: ${name} (auto / builtin / off)`);
}

// 合否の基準。どの Strategy でも共通で、ゲートが持つ。メッセージはエージェントに渡すため英語。
export function judge(
  report: MutationReport,
  values: DecisionValue[],
  adapterSource: string,
  adapterFile = "adapter",
  // 本番コードの置き場所の呼び方（メッセージ用）
  sources = "src/",
): Violation[] {
  const violations: Violation[] = [];
  const adapterNumbers = new Set(
    runtimeLiterals(adapterSource)
      .filter((token) => token.kind === "number")
      .map(valueOf),
  );
  let located = false;

  for (const value of values) {
    const sites = report.mutants.filter((mutant) => mutant.value === value);
    if (sites.length > 0) {
      located = true;
      // その値の出現箇所をどれを変えても合格する = その値は本番コードで決まっていない
      if (sites.every((mutant) => !mutant.killed)) {
        const where = sites.map((mutant) => `line ${mutant.line}`).join(", ");
        violations.push({
          file: sites[0].file,
          rule: "mutation-survived",
          message: `Changing ${sites[0].original} (${where}) does not make the tests fail, so this value is not actually decided by production code. Business decisions must be made in ${sources}, not in the adapter, and production code must not contain dead logic.`,
        });
      }
    } else if (typeof value === "number" && adapterNumbers.has(value)) {
      violations.push({
        file: adapterFile,
        rule: "decision-in-adapter",
        message: `The decision value ${value} appears in the adapter but not in production code. Business decisions must be made in ${sources}.`,
      });
    }
  }

  // 決定表の値が本番コードに1つも見つからない場合（別の表現で書かれている等）は、
  // 一般的な変異が1つでも検出されることだけを求める
  if (!located && !report.mutants.some((mutant) => mutant.killed)) {
    violations.push({
      file: sources,
      rule: "mutation-ineffective",
      message: `No change to production code makes the tests fail, so the tested behaviour does not come from ${sources}.`,
    });
  }
  return violations;
}
