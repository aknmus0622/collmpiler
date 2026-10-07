/**
 * The dependencies of the payload check, described in the check's own terms. The check receives one
 * implementation of each through its constructor and never reaches for anything else.
 *
 * All methods are synchronous.
 */

import type { PayloadDiagnostic, ValueKind } from "./payload-check-types.ts";

/**
 * The effects the specification under check declares, and the fields each of them declares.
 *
 * The answers are asked for at the moment the check needs them and are not kept afterwards. The check may
 * skip a question whose answer cannot matter to what it does.
 */
export interface EffectDeclarations {
  /**
   * Asked: does the specification declare an effect with this name?
   *
   * Specification query: `effectDeclared`. Asked while the check handles `enterEffect`, with the effect name
   * given to that command.
   *
   * @param name the effect name (the query's `name` input).
   */
  isEffectDeclared(name: string): boolean;

  /**
   * Asked: does that effect declare a field with this name?
   *
   * Specification query: `fieldDeclared`. Asked while the check handles `givenField`, with the name of the
   * effect being walked and the field name given to that command.
   *
   * @param effect the effect name (the query's `effect` input).
   * @param field the field name (the query's `field` input).
   */
  isFieldDeclared(effect: string, field: string): boolean;

  /**
   * Asked: which kind of value does that field of that effect take?
   *
   * Specification query: `fieldKind`. Asked while the check handles `givenField`, with the name of the
   * effect being walked and the field name given to that command.
   *
   * @param effect the effect name (the query's `effect` input).
   * @param field the field name (the query's `field` input).
   */
  fieldKind(effect: string, field: string): ValueKind;
}

/**
 * The payloads the specification under check gives to its effects.
 *
 * The answer is asked for at the moment the check needs it and is not kept afterwards.
 */
export interface GivenPayloads {
  /**
   * Asked: does the specification give a value for that field of that effect?
   *
   * Specification query: `fieldGiven`. Asked while the check handles `declaredField`, with the name of the
   * effect being walked and the field name given to that command.
   *
   * @param effect the effect name (the query's `effect` input).
   * @param field the field name (the query's `field` input).
   */
  isFieldGiven(effect: string, field: string): boolean;
}

/**
 * Receives the problems the walk finds.
 */
export interface PayloadDiagnosticReporter {
  /**
   * Told: one problem was found.
   *
   * Specification effect: `ReportDiagnostic`, whose payload fields `code`, `effect` and `field` are the
   * fields of `diagnostic` with the same names.
   *
   * @param diagnostic what kind of problem it is, which effect it was found in, and which field it is about.
   */
  report(diagnostic: PayloadDiagnostic): void;
}

/** Everything the payload check needs from outside, passed to its constructor as one object. */
export interface PayloadCheckDependencies {
  /** Asked whether an effect or a field is declared, and which kind of value a field takes. */
  readonly declarations: EffectDeclarations;
  /** Asked whether a value is given for a field. */
  readonly payloads: GivenPayloads;
  /** Told about each problem found. */
  readonly diagnostics: PayloadDiagnosticReporter;
}
