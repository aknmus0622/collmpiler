import type { Ports, TargetSystemAdapter } from "./loan.adapter.contract.ts";
import { Loan } from "../src/index.ts";
import type { LibraryServices } from "../src/index.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

let loan: Loan | undefined;

function libraryServicesFor(ports: Ports): LibraryServices {
  const world = ports["loan-world"];
  return {
    member: {
      booksOnLoan: () => world.BooksOnLoan(),
      sendDueNotice: (daysUntilDue) => world.NotifyDue({ daysUntilDue }),
    },
    reservations: {
      isReservedBySomeoneElse: () => world.ReservedBySomeoneElse(),
      notifyNextMember: () => world.NotifyNextMember({}),
    },
    billing: {
      chargeLateFee: (yen) => world.ChargeLateFee({ yen }),
      chargeReplacement: () => world.ChargeReplacement({}),
    },
  };
}

function currentLoan(): Loan {
  if (loan === undefined) throw new Error("adapter: setupIsolation was not called");
  return loan;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    loan = new Loan(libraryServicesFor(ports));
  },
  async teardownIsolation() {
    loan = undefined;
  },
  async executeCommand(command) {
    const target = currentLoan();
    switch (command.name) {
      case "Borrow": {
        const { result, dueInDays } = target.borrow();
        return { result, dueInDays };
      }
      case "DayPasses":
        target.daysPass(command.input.days);
        return;
      case "Extend":
        return target.extend();
      case "Return":
        return target.giveBack();
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
};
