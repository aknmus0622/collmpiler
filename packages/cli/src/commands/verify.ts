import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { resolveLayout, workspaceOf } from "../layout.ts";
import { listComponents } from "../loader.ts";
import { selectTarget } from "../target-typescript.ts";

export const summary = "すでにある本番コードを、仕様に照らして検証する (PBT)";
export const usage = `clp verify (--out <dir> | --src <dir> --tests <dir | path-prefix.>) [--specs <dir>] [--component <name>] [options]

  出力先にあるテストの入口を実行して、本番コードが仕様に合っているかを確かめます。何も書き換えません。
  テストの入口は clp apply が生成します。仕様を変えたあとは、先に clp apply を実行してください。

  --out / --src / --tests  clp apply と同じ（出力先の配置）
  --specs <dir>        仕様のディレクトリ（既定: specs）。コンポーネントの名前を知るために読む
  --component <name>   1つのコンポーネントだけを検証する（既定: すべて）
  --seed <n>           乱数のシード。不一致を再現するときに、報告された値を指定する
  --path <p>           反例への経路。不一致を再現するときに、報告された値を指定する
  --runs <n>           試行の回数（既定: 1000）
  --drafts             人が確定していない解釈の下書きを、正解として使う
  --target typescript  対象言語（いまは typescript だけ）`;

export async function main(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      specs: { type: "string", default: "specs" },
      out: { type: "string" },
      src: { type: "string" },
      tests: { type: "string" },
      component: { type: "string" },
      seed: { type: "string" },
      path: { type: "string" },
      runs: { type: "string" },
      drafts: { type: "boolean", default: false },
      target: { type: "string", default: "typescript" },
    },
  });
  if (!values.out && !(values.src && values.tests)) {
    console.error(`出力先を指定してください (--out、または --src と --tests)\n\n${usage}`);
    process.exit(2);
  }
  const target = selectTarget(values.target);
  const layout = resolveLayout(values);
  const names = await listComponents(resolve(process.cwd(), values.specs), { drafts: values.drafts });
  if (values.component !== undefined && !names.includes(values.component)) {
    console.error(`コンポーネント "${values.component}" がありません (あるのは: ${names.join(", ") || "なし"})`);
    process.exit(2);
  }
  const passed = (name: string) => {
    const ws = workspaceOf(layout, target.files, name, names);
    if (!existsSync(join(ws.root, ws.paths.verify))) {
      console.error(`${name}: テストの入口 (${ws.paths.verify}) がありません。先に clp apply を実行してください`);
      return false;
    }
    if (names.length > 1) console.error(`${name}:`);
    // 生成されたテストの入口を、そのまま実行する（結果の行は、標準出力に出る）
    const forwarded = (["seed", "path", "runs"] as const).flatMap((key) => (values[key] === undefined ? [] : [`--${key}`, values[key]]));
    const run = spawnSync(process.execPath, [ws.paths.verify, ...forwarded, ...(values.drafts ? ["--drafts"] : [])], { cwd: ws.root, stdio: "inherit" });
    return run.status === 0;
  };
  const results = names.filter((name) => values.component === undefined || name === values.component).map(passed);
  if (results.length === 0) console.error("仕様にコンポーネントがありません");
  if (results.length === 0 || results.includes(false)) process.exitCode = 1;
}
