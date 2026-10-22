import { readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import type { Violation } from "./check.ts";
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
  // 壊す範囲: その位置を対象にするか（ほかのコンポーネントのコードを除くのに使う）。省略時は、すべて
  executed?: (file: string, offset: number) => boolean;
  // 現在のファイルの状態で PBT を実行し、合格したら true
  test: () => boolean;
};

export interface MutationStrategy {
  name: string;
  run(input: MutationInput): MutationReport | Promise<MutationReport>;
}

// 本番コードで壊してよい値（決定表のセル、答えと外の世界への定数）は、v1/values.ts の decisionValues8 が決める

// 型を空白に置換してからトークン化するので、型の中のリテラルは対象にならず、位置は元のソースと一致する
function runtimeLiterals(source: string) {
  return literalsOf(scan(stripTypeScriptTypes(source, { mode: "strip" })));
}

const valueOf = (token: { kind: string; text: string }): DecisionValue | boolean =>
  token.kind === "number" ? Number(token.text.replaceAll("_", "")) : token.kind === "word" ? token.text === "true" : token.text;

// 自前の Strategy: 本番コードのリテラルを1つずつ変える（数値は +1、文字列は末尾に文字を足す、真偽値は反転）
export const builtinMutation: MutationStrategy = {
  name: "builtin",
  run({ root, files, values, executed, test }) {
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
        // ほかのコンポーネントのコードは、壊しても検出できなくて当然なので、対象にしない
        if (executed && !executed(file, token.start)) continue;
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
// 合否の判断に渡す事実の列（判断を持たない糊）。Stage 0 も Stage 1 (self/specs/mutation-judge.*) も、同じ列を受け取る。
// where は文面のためだけに持つ
export type JudgeEvent =
  | { name: "BeginValue"; input: { numeric: boolean; inAdapter: boolean }; where: { value: DecisionValue } }
  | { name: "Site"; input: { killed: boolean }; where: {} }
  | { name: "EndValue"; input: {}; where: { value: DecisionValue } }
  | { name: "Mutant"; input: { killed: boolean }; where: {} }
  | { name: "Finish"; input: { shared: boolean }; where: {} };
export function* judgeEvents(report: MutationReport, values: DecisionValue[], adapterSource: string, shared = false): Generator<JudgeEvent> {
  const adapterNumbers = new Set(
    runtimeLiterals(adapterSource)
      .filter((token) => token.kind === "number")
      .map(valueOf),
  );
  for (const value of values) {
    yield { name: "BeginValue", input: { numeric: typeof value === "number", inAdapter: typeof value === "number" && adapterNumbers.has(value) }, where: { value } };
    for (const mutant of report.mutants) if (mutant.value === value) yield { name: "Site", input: { killed: mutant.killed }, where: {} };
    yield { name: "EndValue", input: {}, where: { value } };
  }
  for (const mutant of report.mutants) yield { name: "Mutant", input: { killed: mutant.killed }, where: {} };
  yield { name: "Finish", input: { shared }, where: {} };
}

// 合否の判断。値ごと: その値を変えたどの箇所でもテストが落ちない (survived)、本番コードに無くアダプターにだけある (in-adapter)。
// 全体: 決定表の値が本番コードに1つも見つからず、どの変異も検出されない (ineffective。共有していて壊す範囲を絞れていないときは見ない)
export type JudgeReport = { code: "survived" | "in-adapter" | "ineffective"; event: JudgeEvent };
export function judgeStage0(events: Iterable<JudgeEvent>): JudgeReport[] {
  const found: JudgeReport[] = [];
  let sawSite = false;
  let siteKilled = false;
  let inAdapter = false;
  let located = false;
  let anyKilled = false;
  for (const event of events) {
    switch (event.name) {
      case "BeginValue":
        [sawSite, siteKilled, inAdapter] = [false, false, event.input.inAdapter];
        break;
      case "Site":
        sawSite = true;
        siteKilled ||= event.input.killed;
        break;
      case "EndValue":
        if (sawSite) {
          located = true;
          if (!siteKilled) found.push({ code: "survived", event });
        } else if (inAdapter) found.push({ code: "in-adapter", event });
        break;
      case "Mutant":
        anyKilled ||= event.input.killed;
        break;
      case "Finish":
        // 決定表の値が本番コードに1つも見つからない場合（別の表現で書かれている等）は、一般的な変異が1つでも検出されることだけを求める。
        // 本番コードをほかのコンポーネントと共有していて、壊す範囲を絞れていないときは、この基準は使わない:
        // 壊した箇所の多くはほかのコンポーネントのコードで、このコンポーネントのテストでは検出できなくて当然だからである
        if (!located && !event.input.shared && !anyKilled) found.push({ code: "ineffective", event });
        break;
    }
  }
  return found;
}

// 判断に、文面を付ける
export function judgeMessages(decided: JudgeReport[], report: MutationReport, adapterFile = "adapter", sources = "src/"): Violation[] {
  return decided.map(({ code, event }): Violation => {
    if (code === "ineffective") {
      return { file: sources, rule: "mutation-ineffective", message: `No change to production code makes the tests fail, so the tested behaviour does not come from ${sources}.` };
    }
    const value = (event.where as { value: DecisionValue }).value;
    if (code === "in-adapter") {
      return { file: adapterFile, rule: "decision-in-adapter", message: `The decision value ${value} appears in the adapter but not in production code. Business decisions must be made in ${sources}.` };
    }
    const sites = report.mutants.filter((mutant) => mutant.value === value);
    const where = sites.map((mutant) => `line ${mutant.line}`).join(", ");
    return {
      file: sites[0].file,
      rule: "mutation-survived",
      message: `Changing ${sites[0].original} (${where}) does not make the tests fail, so this value is not actually decided by production code. Business decisions must be made in ${sources}, not in the adapter, and production code must not contain dead logic.`,
    };
  });
}

// 合否の決まり。decided: 判断（無ければ Stage 0 が下す）
export function judge(
  report: MutationReport,
  values: DecisionValue[],
  adapterSource: string,
  adapterFile = "adapter",
  // 本番コードの置き場所の呼び方（メッセージ用）
  sources = "src/",
  // true なら、本番コードをほかのコンポーネントと共有していて、しかも実行した範囲に絞れていない
  shared = false,
  decided?: JudgeReport[],
): Violation[] {
  return judgeMessages(decided ?? judgeStage0(judgeEvents(report, values, adapterSource, shared)), report, adapterFile, sources);
}
