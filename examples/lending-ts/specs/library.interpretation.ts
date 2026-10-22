// layer1 Fines: sha256:5cf27bab09bc08c8cd67bc1dbc8f58acb337eb618e0254b3d8b81efbc58f545c
// layer1 Library: sha256:687a0c24d3d750501fc6a224a1667fb85a4bb0fb2ced3b3d4ac7784c57e43883
// layer1 Members: sha256:8cbc284348e50e7aba0c74e45d4203434bac1fae9b7d55c9d70a5dcede762f93
import { always, after, interpretation, is, Map, requires, Set } from "@clp/core/v1";
import type { Int } from "@clp/core/v1";
import { Clock, Fines, Library, Members, Policy } from "./library.component.ts";
import type { BookId, MemberId } from "./library.component.ts";

export const LibraryInterpretation = interpretation(Library, {
  state: { dueOf: Map<BookId, Int>() },
  conditions: {
    onLoan(member: MemberId, book: BookId) {
      return this.lentTo.has(book);
    },
  },
  does: {
    rememberDue(member: MemberId, book: BookId) {
      this.dueOf.set(book, Clock.Today() + Policy(member).loanDays);
    },
  },
  commands: {
    Return(book: BookId) {
      if (is.notLent("その本は貸していない", !this.lentTo.has(book))) return "not-lent";
      if (is.late("期限を過ぎている", Clock.Today() > this.dueOf.get(book))) {
        Fines.Charge(this.lentTo.get(book), Clock.Today() - this.dueOf.get(book));
      }
      this.lentTo.delete(book);
      this.dueOf.delete(book);
      return "returned";
    },
  },
  queries: {
    LoansOf(member: MemberId) {
      return this.lentTo.keys().filter((b) => this.lentTo.get(b) === member);
    },
  },
  rules: {
    dueForEveryLoan() {
      return always(() => this.lentTo.keys().every((b) => this.dueOf.has(b)));
    },
    returnedNotLent() {
      return always.on.Return((book: BookId) => after(() => !this.lentTo.has(book)));
    },
  },
});

export const FinesInterpretation = interpretation(Fines, {
  state: { owed: Map<MemberId, Int>() },
  commands: {
    Charge(member: MemberId, days: Int) {
      requires(days >= 1);
      this.owed.set(member, (this.owed.has(member) ? this.owed.get(member) : 0) + days * 10);
    },
    Pay(member: MemberId) {
      this.owed.delete(member);
    },
  },
  queries: {
    Owed(member: MemberId) {
      return this.owed.has(member) ? this.owed.get(member) : 0;
    },
  },
  trace: {
    延滞料: ["Fines"],
    "期限を過ぎて返した日数 × 10 円を、会員ごとに足していく": ["Charge"],
    "払えば 0 になる": ["Pay"],
  },
});

export const MembersInterpretation = interpretation(Members, {
  state: { members: Set<MemberId>(), extended: Set<MemberId>() },
  commands: {
    Register(member: MemberId) {
      if (is.registered("すでに会員", this.members.has(member))) return "already";
      this.members.add(member);
      return "registered";
    },
    Extend(member: MemberId) {
      if (is.notRegistered("会員でない", !this.members.has(member))) return "not-member";
      this.extended.add(member);
      return "extended";
    },
  },
  queries: {
    IsMember(member: MemberId) {
      return this.members.has(member);
    },
    IsExtended(member: MemberId) {
      return this.extended.has(member);
    },
  },
  trace: {
    会員を登録し: ["Register"],
    "会員か、延長会員かを答える": ["IsMember", "IsExtended", "Extend"],
  },
});
