// 重ね合わせの判定 (N12g) の Stage 0。Layer 1 に解釈を重ねるとき (resolveComponent) に出会う事実の1つずつについて、
// どんな問題かを決める（問題が無ければ空）。言葉は、事実を作った側が持つ。読み込む側 (packages/cli) は、同じ事実を Stage 1
// (overlay-check) で判断し直せる。
//
// 事実:
//   key       … 解釈に書いたキー（構造のキー、項目の部品、コマンドのキー）が、そこに書けるものか
//   slot      … 1つの場所に、Layer 1 と解釈がそれぞれ書いたか（known: そこに書けるものか。Layer 1 が勝つので、両方なら問題）
//   state     … 名前つきで並べた状態に、説明があるか
//   entry     … 解釈が足した項目（コマンド、場合）が、Layer 1 にあるか（listed: Layer 1 が項目を並べた。closed: 足せないまとまり）
//   branching … 場合分けを、Layer 1 と解釈のどちらが書いたか。場合の外に書いた起きること (flat) と、Layer 1 の遷移先
//   asks      … 尋ねることに書いた問い合わせの数
//   call      … 呼ぶ部品があるか。多数ある部品か、キーを書いたか
//   stamp     … 解釈に記録した Layer 1 のハッシュと、いまのハッシュ（古さ）
export type OverlayFact =
  | { kind: "key"; known: boolean }
  | { kind: "slot"; known: boolean; layer1: boolean; interpretation: boolean }
  | { kind: "state"; described: boolean }
  | { kind: "entry"; listed: boolean; closed: boolean; inLayer1: boolean }
  | { kind: "branching"; layer1Cases: boolean; interpretationCases: boolean; flat: boolean; layer1Outcome: boolean; layer1GoTo: boolean }
  | { kind: "asks"; count: number }
  | { kind: "call"; exists: boolean; keyedPart: boolean; keyGiven: boolean }
  | { kind: "stamp"; recorded: string | null; current: string };
export type OverlayCode =
  | "unknown-key"
  | "conflict"
  | "undescribed"
  | "closed"
  | "flat-in-cases"
  | "layer1-outside-cases"
  | "branch-over-goto"
  | "one-query"
  | "no-part"
  | "key-missing"
  | "key-extra"
  | "stale";

export function overlayCodesStage0(fact: OverlayFact): OverlayCode[] {
  switch (fact.kind) {
    case "key":
      return fact.known ? [] : ["unknown-key"];
    case "slot":
      return !fact.known ? ["unknown-key"] : fact.layer1 && fact.interpretation ? ["conflict"] : [];
    case "state":
      return fact.described ? [] : ["undescribed"];
    case "entry":
      return fact.listed && fact.closed && !fact.inLayer1 ? ["closed"] : [];
    case "branching": {
      // Layer 1 が場合分けを書いた: 起きることは場合の中に。Layer 1 の goTo / does / responds も場合の中に。
      // 解釈だけが場合分けを書いた: 起きることは場合の中に。Layer 1 が遷移先を1つに決めていれば、場合分けできない
      if (fact.layer1Cases) return [...(fact.flat ? ["flat-in-cases" as const] : []), ...(fact.layer1Outcome ? ["layer1-outside-cases" as const] : [])];
      if (fact.interpretationCases) return [...(fact.flat ? ["flat-in-cases" as const] : []), ...(fact.layer1GoTo ? ["branch-over-goto" as const] : [])];
      return [];
    }
    case "asks":
      return fact.count === 1 ? [] : ["one-query"];
    case "call":
      return !fact.exists ? ["no-part"] : fact.keyedPart && !fact.keyGiven ? ["key-missing"] : !fact.keyedPart && fact.keyGiven ? ["key-extra"] : [];
    case "stamp":
      return fact.recorded !== null && fact.recorded !== fact.current ? ["stale"] : [];
  }
}
