import type { Ports, TargetSystemAdapter } from "./library.adapter.contract.ts";
import { Library } from "../src/library/index.ts";
import type { Clock } from "../src/library/index.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let library: Library | undefined;

function system(): Library {
  if (library === undefined) throw new Error("adapter: setupIsolation was not called");
  return library;
}

function clockFrom(ports: Ports): Clock {
  return { today: () => ports.clock.Today() };
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    library = new Library(clockFrom(ports));
  },
  async teardownIsolation() {
    library = undefined;
  },
  async executeCommand(command) {
    const lib = system();
    switch (command.name) {
      case "Borrow":
        return lib.borrow(command.input.book, command.input.member);
      case "Return":
        return lib.returnBook(command.input.book);
      case "fines.Pay":
        lib.fines.pay(command.input.member);
        return;
      case "members.Extend":
        return lib.members.extend(command.input.member);
      case "members.Register":
        return lib.members.register(command.input.member);
    }
  },
  async executeQuery(query) {
    const lib = system();
    switch (query.name) {
      case "LoansOf":
        return [...lib.loansOf(query.input.member)];
      case "fines.Owed":
        return lib.fines.owed(query.input.member);
      case "members.IsExtended":
        return lib.members.isExtended(query.input.member);
      case "members.IsMember":
        return lib.members.isMember(query.input.member);
    }
  },
};
