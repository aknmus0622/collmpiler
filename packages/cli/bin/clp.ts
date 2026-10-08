#!/usr/bin/env node
// clp: 仕様を書き、LLM に本番コードを書かせ、検証するための入口。
// 先に Node のバージョンを確かめる。コマンドの本体は、そのあとで読み込む
// （型を取り除いて実行できない Node では、このファイル自体が読めないこともある。そのときは engines と .node-version が頼り）

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`clp: Node >=22.18 が必要です (現在 ${process.versions.node})`);
  console.error("     .node-version に従い、mise / nvm 等で切り替えてください");
  process.exit(1);
}

// サブコマンド。読み込むのは、選ばれたものだけ
type Command = { main(args: string[]): Promise<void>; summary?: string; usage?: string };
const COMMANDS: Record<string, () => Promise<Command>> = {
  compile: () => import("../src/commands/compile.ts"),
  interpret: () => import("../src/commands/interpret.ts"),
  apply: () => import("../src/commands/apply.ts"),
  verify: () => import("../src/commands/verify.ts"),
};
// 内部用（clp 自身が、別プロセスとして呼ぶ）
const INTERNAL: Record<string, () => Promise<Command>> = {
  __compare: () => import("../src/commands/compare.ts"),
};

async function overview() {
  const lines: string[] = [];
  for (const [name, load] of Object.entries(COMMANDS)) lines.push(`  ${name.padEnd(10)} ${(await load()).summary}`);
  return `clp <command> [options]

  仕様 (Layer 1) を書く → clp interpret で解釈を導き、確定する → clp apply で本番コードを書かせる。
  仕様を変えたら、同じ順でもう一度実行します。

${lines.join("\n")}

  clp <command> --help で、そのコマンドの使い方を表示します。`;
}

const [name, ...rest] = process.argv.slice(2);
if (name === undefined || name === "--help" || name === "-h" || name === "help") {
  console.log(await overview());
  process.exit(name === undefined ? 2 : 0);
}
const load = COMMANDS[name] ?? INTERNAL[name];
if (!load) {
  console.error(`clp: "${name}" というコマンドはありません\n\n${await overview()}`);
  process.exit(2);
}
const command = await load();
if (rest.includes("--help") || rest.includes("-h")) {
  console.log(command.usage ?? name);
  process.exit(0);
}
try {
  await command.main(rest);
} catch (error) {
  // 引数の誤り（知らないオプションなど）は、使い方と一緒に伝える
  if (error instanceof TypeError && String((error as { code?: unknown }).code).startsWith("ERR_PARSE_ARGS")) {
    console.error(`clp ${name}: ${error.message}\n\n${command.usage ?? ""}`);
    process.exit(2);
  }
  console.error(`clp ${name}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
