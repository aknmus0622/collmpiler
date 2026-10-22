// layer1 Fines: sha256:a7e9963a0053c421be6eef08e9e3c177f52bd9cdc6812505d2bc4b33346a1cb1
// layer1 Library: sha256:3c8533c34af1fe35703a7798f8504459779308dfac4fed80ea945914e7891ae5
// layer1 Members: sha256:a34d6d2fbc75b9573833acd8866d2a54d0b2a7ec8b1b79d24b89097832e17d0b
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
