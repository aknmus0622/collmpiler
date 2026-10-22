import { answer, decisions, does, example, expect, external, is, Map, otherwise, service } from "@clp/core/v1";
import type { Id, Int } from "@clp/core/v1";

export type MemberId = Id<"会員番号">;
export type BookId = Id<"本の番号">;

export const Members = service("会員を登録し、会員か、延長会員かを答える。");
export const Fines = service("延滞料。期限を過ぎて返した日数 × 10 円を、会員ごとに足していく。払えば 0 になる。");
export const Clock = external("今日の日付（1970-01-01 からの日数）", {
  queries: { Today: (): Int => answer({ increasing: true }) },
});

export const Policy = decisions("貸出の方針", (member: MemberId) => [
  [is.extended("延長会員", Members.IsExtended(member)), { maxBooks: 3, loanDays: 28 }],
  [otherwise, { maxBooks: 2, loanDays: 14 }],
]);

export const Library = service("図書館。本を貸し、返してもらい、延滞料を取る。", {
  state: {
    lentTo: Map<BookId, MemberId>(),
    dueOf: "貸している本ごとの、返す期限",
  },

  commands: {
    Borrow(member: MemberId, book: BookId) {
      if (is.notMember("会員でない", !Members.IsMember(member))) return "not-member";
      if (is.unpaid("未払いの延滞料がある", Fines.Owed(member) > 0)) return "unpaid";
      if (is.onLoan("その本は貸出中")) return "on-loan";
      if (is.atLimit("上限まで借りている", this.lentTo.count((_, m) => m === member) >= Policy(member).maxBooks)) return "limit";
      this.lentTo.set(book, member);
      does.rememberDue("返す期限を覚える");
      return "lent";
    },
    Return: "本を返してもらう。期限を過ぎていれば、過ぎた日数を延滞料に付ける。",
  },

  queries: {
    LoansOf: "その会員が借りている本",
  },

  rules: {
    dueForEveryLoan: "貸出中の本には、必ず期限がある",
    returnedNotLent: "返された本は、次の時点で貸出中でない",
  },

  examples: {
    unpaidRefused: example("未払いのある会員は借りられない", () => {
      Members.Register("M001");
      Fines.Charge("M001", 3);
      expect(Library.Borrow("M001", "B1")).toBe("unpaid");
    }),
  },
});
