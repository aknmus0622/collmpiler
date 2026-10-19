/**
 * Vocabulary of the text plan: the facts it is handed about a component or a request, and what it
 * decides the texts given to agents are made of.
 */

/**
 * Position of the text plan. Corresponds to the specification's states:
 *
 * - `"ready"`: `READY`
 */
export type TextPlanState = "ready";

/**
 * Facts about a component whose contract is being written. Corresponds to the input of the
 * specification's `ContractSections` command, field for field:
 *
 * - `outputs`: how many commands answer with something (`outputs`);
 * - `parts`: how many contained components there are (`parts`);
 * - `routes`: how many commands have an HTTP route (`routes`);
 * - `restarts`: whether the component keeps what it has across a restart (`restarts`).
 */
export interface ContractFacts {
  readonly outputs: number;
  readonly parts: number;
  readonly routes: number;
  readonly restarts: boolean;
}

/**
 * Which optional sections a contract includes; `true` means the section is included. Corresponds to the
 * answer of the specification's `ContractSections` command, field for field:
 *
 * - `commandOutput`: the section on what commands answer with (`commandOutput`);
 * - `partsNote`: the note about the dependencies of contained components (`partsNote`);
 * - `restarts`: the section on storage and restart (`restarts`);
 * - `routes`: the section on HTTP routes (`routes`).
 */
export interface ContractSections {
  readonly commandOutput: boolean;
  readonly partsNote: boolean;
  readonly restarts: boolean;
  readonly routes: boolean;
}

/**
 * What the environment guarantees about the answers of a query. Corresponds to the `promise` input of
 * the specification's `QueryNotes` command, with the same spellings (`"none"`: no promise).
 */
export type QueryPromise = "none" | "fresh" | "increasing";

/**
 * One note a query carries in the contract. Corresponds to an element of the answer of the
 * specification's `QueryNotes` command, with the same spellings.
 */
export type QueryNote = "fresh" | "increasing" | "may-fail";

/**
 * The phase a request to an agent belongs to. Corresponds to the `phase` input of the specification's
 * `RequestSections` command, with the same spellings.
 */
export type RequestPhase = "design" | "wiring" | "implementation";

/**
 * Facts about a request to an agent. Corresponds to the input of the specification's `RequestSections`
 * command, field for field:
 *
 * - `attempt`: the number of the attempt, starting at 1 (`attempt`);
 * - `hasFeedback`: whether there is feedback to give (`hasFeedback`);
 * - `others`: how many other components share the system (`others`);
 * - `partFiles`: how many contained components there are to list (`partFiles`);
 * - `phase`: the phase of the request (`phase`).
 */
export interface RequestFacts {
  readonly attempt: number;
  readonly hasFeedback: boolean;
  readonly others: number;
  readonly partFiles: number;
  readonly phase: RequestPhase;
}

/**
 * What the feedback section of a request is about. Corresponds to the `feedback` field of the answer of
 * the specification's `RequestSections` command, with the same spellings:
 *
 * - `"none"`: no feedback section;
 * - `"current-code"`: feedback about the code as it is before any session;
 * - `"previous-attempt"`: feedback about the previous attempt.
 */
export type FeedbackSection = "none" | "current-code" | "previous-attempt";

/**
 * Which optional sections a request includes. Corresponds to the answer of the specification's
 * `RequestSections` command, field for field:
 *
 * - `contained`: whether the components this one contains are listed (`contained`);
 * - `feedback`: what the feedback section is about (`feedback`);
 * - `others`: whether the other components of the same system are listed (`others`).
 */
export interface RequestSections {
  readonly contained: boolean;
  readonly feedback: FeedbackSection;
  readonly others: boolean;
}

/**
 * A variant of a oneOf whose type is already written. Corresponds to an element of the `entries` input of
 * the specification's `TypeText` command when `kind` is `one-of`: `name` and `text` are its `name` and
 * `text` (its `optional` does not apply to variants).
 */
export interface WrittenVariant {
  readonly name: string;
  readonly text: string;
}

/**
 * A field of a record whose type is already written. Corresponds to an element of the `entries` input of
 * the specification's `TypeText` command when `kind` is `record`: `name`, `optional` and `text` are its
 * `name`, `optional` and `text`.
 */
export interface WrittenField {
  readonly name: string;
  readonly optional: boolean;
  readonly text: string;
}

/**
 * A type to write in TypeScript, with the types inside it already written. Corresponds to the input of
 * the specification's `TypeText` command; `kind` is its `kind`, with the same spellings, and only the
 * inputs that matter for that kind are present:
 *
 * - `"value"`: any value; no further input;
 * - `"one-of"`: `variants` is the spec's `entries` (in the order given, not necessarily sorted);
 * - `"optional"`: `inner` is the spec's `inner`, the written text of the type that may be absent;
 * - `"list"`: `inner` is the spec's `inner`, the written text of the element type;
 * - `"record"`: `fields` is the spec's `entries` (in the order given, not necessarily sorted);
 * - `"enum"`: `members` is the spec's `members`, each already written as a literal;
 * - `"string"`, `"number"`: no further input;
 * - `"primitive"`: any other primitive; `name` is the spec's `name`, the primitive's name.
 */
export type TypeShape =
  | { readonly kind: "value" }
  | { readonly kind: "one-of"; readonly variants: readonly WrittenVariant[] }
  | { readonly kind: "optional"; readonly inner: string }
  | { readonly kind: "list"; readonly inner: string }
  | { readonly kind: "record"; readonly fields: readonly WrittenField[] }
  | { readonly kind: "enum"; readonly members: readonly string[] }
  | { readonly kind: "string" }
  | { readonly kind: "number" }
  | { readonly kind: "primitive"; readonly name: string };
