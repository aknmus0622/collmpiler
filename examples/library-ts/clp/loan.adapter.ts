import type { Command, Ports, StateName, TargetSystemAdapter } from "./loan.adapter.contract.ts";
import { Loan } from "../src/index.ts";
import type { LoanDependencies } from "../src/index.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let loan: Loan | undefined;

function currentLoan(): Loan {
  if (loan === undefined) {
    throw new Error("adapter: setupIsolation has not been called");
  }
  return loan;
}

function dependenciesFor(ports: Ports): LoanDependencies {
  return {
    memberAccount: {
      booksOnLoan: () => ports.queries.booksOnLoan(),
    },
    reservationDesk: {
      isReservedBySomeoneElse: () => ports.queries.reservedBySomeoneElse(),
      notifyNextMember: () => ports.effects.NextMemberNotice({}),
    },
    memberNotifier: {
      notifyDueDate: (daysUntilDue) => ports.effects.DueDateNotice({ daysUntilDue }),
    },
    billing: {
      chargeLateFee: (amountYen) => ports.effects.LateFeeCharge({ amount: amountYen }),
      chargeReplacement: () => ports.effects.ReplacementCharge({}),
    },
  };
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    loan = new Loan(dependenciesFor(ports));
  },
  async teardownIsolation() {
    loan = undefined;
  },
  async executeCommand(command: Command) {
    const target = currentLoan();
    switch (command.name) {
      case "Borrow":
        target.borrow();
        return;
      case "DayPasses":
        target.daysPass(command.input.days);
        return;
      case "Extend":
        target.extend();
        return;
      case "Return":
        target.returnBook();
        return;
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    return currentLoan().state;
  },
};
