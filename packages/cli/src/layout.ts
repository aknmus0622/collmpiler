import { existsSync, readdirSync } from "node:fs";
import type { Dirent } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";

// 配置: 本番コードとテスト側のファイルを、どこに置くか。
// プロジェクトごとの流儀 (src/ と test/ を分ける、同じ場所に並べる、など) に合わせられるよう、引数で決める。
//
//   root   … 本番コードとテスト側の両方を含む、いちばん深いディレクトリ。検証はここで実行する。
//            エージェントの作業場所は、ここからの相対位置をそのまま写す（相対 import が同じ形になるように）
//   src    … 本番コードのディレクトリ。中身はエージェントが書く（フレームワークが管理する場所）
//   tests  … テスト側のファイル (IR・契約・テストの入口・アダプター) を置くディレクトリ
//   prefix … テスト側のファイル名の接頭辞。本番コードと同じ場所に並べるとき、名前で見分けるためのもの
//
// 引数は2つ: 本番コードの場所 (--src) と、テスト側の場所 (--tests)。
// --tests は「テスト側のファイル名の前に付けるパス」で、"." で終われば最後の部分がファイル名の接頭辞になる:
//   --tests test/clp          → test/clp/order.adapter.ts
//   --tests src/order/clp.    → src/order/clp.order.adapter.ts

export type Layout = {
  // 絶対パス
  root: string;
  // root からの相対パス (区切りは "/")。root 自身なら ""
  src: string;
  tests: string;
  // "" か、"order.clp." のように "." で終わる文字列
  prefix: string;
};

// 1つのコンポーネントの、テスト側のファイル (root からの相対パス)。
// ファイル名にはコンポーネントの名前が付く (clp/order.adapter.ts など)
export type TestPaths = { ir: string; contract: string; adapter: string; verify: string };
export type Workspace = Layout & {
  // このコンポーネントの名前と、そのテスト側のファイル
  component: string;
  paths: TestPaths;
  // すべてのコンポーネントのテスト側のファイル。本番コードとしては扱わない
  reserved: string[];
};

// 作業場所の中で、依頼文と添付資料を置く場所。配置によらず固定（エージェントの起動コマンドがここを指すため）
export const CONTROL_DIR = "clp";
export const DEFAULT_SOURCE_DIR = "src";
export const DEFAULT_TESTS_DIR = "clp";
const IR_FILE = "ir.json";

const toPosix = (path: string) => path.split(sep).join("/");
export const under = (dir: string, name: string) => (dir === "" ? name : `${dir}/${name}`);
// 依頼文などに書くときの、ディレクトリの呼び方
export const label = (dir: string) => (dir === "" ? "./" : `${dir}/`);
const inside = (dir: string, rel: string) => dir === "" || rel.startsWith(`${dir}/`);

export type LayoutOptions = { out?: string; src?: string; tests?: string };

// 引数から配置を決める。パスは process.cwd() 基準。
//   --out だけ          … <out>/src と <out>/clp
//   --src / --tests     … それぞれの場所。省略した側は --out の下の既定の場所。
//                         --tests が "." で終わるときは、最後の部分がテスト側のファイル名の接頭辞
export function resolveLayout(options: LayoutOptions): Layout {
  const place = (given: string | undefined, fallback: string) => {
    if (given !== undefined) return resolve(process.cwd(), given);
    if (options.out === undefined) throw new Error("--out か、--src と --tests の両方を指定してください");
    return resolve(process.cwd(), options.out, fallback);
  };
  const src = place(options.src, DEFAULT_SOURCE_DIR);
  // "src/order/order.clp." → ディレクトリ src/order と、接頭辞 "order.clp."
  const named = options.tests?.endsWith(".") && !/(^|[\\/])\.{1,2}$/.test(options.tests) ? options.tests : undefined;
  const prefix = named === undefined ? "" : named.split(/[\\/]/).at(-1)!;
  const tests = named === undefined ? place(options.tests, DEFAULT_TESTS_DIR) : resolve(process.cwd(), named.slice(0, -prefix.length) || ".");

  // 両方を含む、いちばん深いディレクトリ
  const a = src.split(sep);
  const b = tests.split(sep);
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
  const root = a.slice(0, shared).join(sep) || sep;

  if (prefix !== "" && !/^[\w.-]+$/.test(prefix)) throw new Error(`--tests の接頭辞に使えない文字があります: ${prefix}`);
  const layout = { root, src: toPosix(relative(root, src)), tests: toPosix(relative(root, tests)), prefix };

  // 本番コードとテスト側を同じ場所に置くなら、名前で見分けられなければならない
  if (layout.tests === layout.src && layout.prefix === "") {
    throw new Error('本番コードとテスト側を同じディレクトリに置くときは、--tests にファイル名の接頭辞まで書いてください (例: --tests src/order/clp. 末尾の "." が接頭辞の印です)');
  }
  // src の中身はエージェントが書き直す。プロジェクトのルートを指していたら、消してはいけないものまで消してしまう
  for (const name of ["package.json", "node_modules", ".git"]) {
    if (existsSync(join(src, name))) {
      throw new Error(`--src (${src}) に ${name} があります。本番コードのディレクトリは、エージェントが中身を書き直す場所です。プロジェクトのルートは指定できません`);
    }
  }
  return layout;
}

// component: このコンポーネントの名前。all: 同じ出力先を使う、すべてのコンポーネントの名前
export function workspaceOf(
  layout: Layout,
  files: { contract: string; adapter: string; verify: string },
  component: string,
  all: readonly string[] = [component],
): Workspace {
  const pathsOf = (name: string): TestPaths => {
    const at = (file: string) => under(layout.tests, `${layout.prefix}${name}.${file}`);
    return { ir: at(IR_FILE), contract: at(files.contract), adapter: at(files.adapter), verify: at(files.verify) };
  };
  const reserved = [...new Set([component, ...all])].flatMap((name) => Object.values(pathsOf(name)));
  return { ...layout, component, paths: pathsOf(component), reserved };
}

// root からの相対パスが、本番コードのファイルかどうか。
// src の中にあって、テスト側のファイルでも、作業場所の依頼文・添付資料でもないもの
export function isSource(ws: Workspace, rel: string): boolean {
  if (!inside(ws.src, rel)) return false;
  if (ws.reserved.includes(rel)) return false;
  if (rel === `${CONTROL_DIR}/REQUEST.md` || rel.startsWith(`${CONTROL_DIR}/assets/`)) return false;
  // 接頭辞つきの名前は、テスト側のために空けておく
  return ws.prefix === "" || !posix.basename(rel).startsWith(ws.prefix);
}

// 本番コードのファイル (root からの相対パス)。base は root の代わりに見る場所（作業場所など）
export function sourceFiles(ws: Workspace, base = ws.root): string[] {
  const dir = join(base, ws.src);
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true, withFileTypes: true }) as Dirent[])
    .filter((entry) => entry.isFile())
    .map((entry) => toPosix(relative(base, join(entry.parentPath, entry.name))))
    .filter((rel) => isSource(ws, rel))
    .sort();
}

// あるファイルから別のパスへの、import に書ける相対パス ("./x.ts"、"../src/")
export function importPath(fromFile: string, to: string): string {
  const rel = posix.relative(posix.dirname(fromFile), to) || ".";
  return rel.startsWith(".") ? rel : `./${rel}`;
}
// あるファイルから見た、ディレクトリの呼び方 ("../src/"、"./")
export const dirFrom = (fromFile: string, dir: string) => `${importPath(fromFile, dir === "" ? "." : dir).replace(/\/$/, "")}/`;
export const testsDirOf = (ws: Workspace) => join(ws.root, dirname(ws.paths.ir));
