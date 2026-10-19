import type {
  ContractFacts,
  ContractSections,
  QueryNote,
  QueryPromise,
  RequestFacts,
  RequestSections,
  TextPlanState,
  TypeShape,
} from "./types.ts";
import { contractSections, queryNotes, requestSections, typeText } from "./plan.ts";

/**
 * Decides what the texts given to agents are made of: how types are written in the contract, and which
 * notes and sections appear in a contract and in a request.
 *
 * A new instance starts in the specification's initial state; the specification has no remembered data
 * and no dependencies, so every command can be called in any order and any number of times. Each method
 * below performs one command of the specification; its outcome is the value it returns.
 */
export class TextPlan {
  private readonly currentState: TextPlanState = "ready";

  /** The current state. `TextPlanState` lists the specification name of each value. */
  get state(): TextPlanState {
    return this.currentState;
  }

  /**
   * Performs the command `ContractSections`.
   *
   * @param facts the command's input; `ContractFacts` says how its fields correspond to the spec
   * @returns the command's answer; `ContractSections` says how its fields correspond to the spec
   */
  contractSections(facts: ContractFacts): ContractSections {
    return contractSections(facts);
  }

  /**
   * Performs the command `QueryNotes`.
   *
   * @param promise the command's `promise`
   * @param mayFail the command's `mayFail`
   * @returns the command's answer: the notes, in order
   */
  queryNotes(promise: QueryPromise, mayFail: boolean): QueryNote[] {
    return queryNotes(promise, mayFail);
  }

  /**
   * Performs the command `RequestSections`.
   *
   * @param facts the command's input; `RequestFacts` says how its fields correspond to the spec
   * @returns the command's answer; `RequestSections` says how its fields correspond to the spec
   */
  requestSections(facts: RequestFacts): RequestSections {
    return requestSections(facts);
  }

  /**
   * Performs the command `TypeText`.
   *
   * @param shape the command's input; `TypeShape` says how it corresponds to the spec's `kind`, `inner`,
   *   `entries`, `members` and `name` (inputs that do not apply to the kind are left out)
   * @returns the command's answer: the TypeScript text of the type
   */
  typeText(shape: TypeShape): string {
    return typeText(shape);
  }
}
