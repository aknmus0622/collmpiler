import type { Constant, FieldSchema } from "@clp/core";
import { isReference, isRecordOutput, kindOf, mismatchOf, respondedValues, typeOfValue } from "./extract.ts";
import type { SpecInput, SpecValue } from "./extract.ts";
import { compatible, conforms, isEnum, isNumberSchema, isOneOf, isOptional, isStructured } from "./schema.ts";

// 値の置き場所（スロット）の検査: 副作用の入力、尋ねることの引数、呼ぶコマンドの入力、覚えるデータ、返す値、部品を作る・消すこと、
// データのはじめの値、副作用の条件。宣言と与えたものの形（足りない、知らない、形が違う）と、値が型に合うかを見る。
//
// 仕様をたどって事実の列を作る糊と、判断（Stage 0、手書き）を分けてある。判断は、フレームワーク自身の仕様から生成した部品
// (Stage 1、self/specs/payload-check.*) でも下せる。構造を持つ型（record、list、optional、oneOf）どうしの比べ方は、
// その部品の範囲の外なので、Stage 0 が比べた結果を事実 (Judged) として渡す（SELF_HOSTING.md §11、案 B）。
// 判断は、スロットの鍵と、フィールドで引く。文面は extract が、いままでの所で付ける

export type SlotKind = "effect" | "asks" | "calls" | "set" | "responds" | "change" | "adds" | "initially" | "onlyWhen";
export type ValueEvent =
  | { name: "Constant"; input: { kind: "boolean" | "integer" | "number" | "string"; text: string; number: number } }
  | { name: "Typed"; input: { type: "boolean" | "integer" | "number" | "string" } }
  | { name: "Unresolved"; input: {} }
  | { name: "Null"; input: {} }
  | { name: "Judged"; input: { fits: boolean } };
export type SlotEvent =
  | {
      name: "EnterSlot";
      input: {
        kind: SlotKind;
        declared: boolean;
        keyedOk: boolean;
        commandDeclared: boolean;
        output: "none" | "single" | "fields" | "variant";
        given: "none" | "single" | "fields";
        givenCount: number;
      };
    }
  | { name: "DeclaredField" | "GivenField"; input: { name: string } }
  | { name: "Source"; input: { kind: "constant" | "input" | "data" | "other" } }
  | ValueEvent
  | { name: "LeaveSlot"; input: {} };

// フィールドの型の種類（部品が問い合わせる）。value は何でも入る値、structured は構造を持つ型
export type FieldKind = "boolean" | "integer" | "number" | "string" | "enum" | "value" | "structured";
export const fieldKindOf = (schema: FieldSchema): FieldKind => (schema === "value" ? "value" : isStructured(schema) ? "structured" : kindOf(schema));

// スロット1つ: 鍵、宣言したフィールド（型と、無いことがあるもの）、与えたフィールド、事実の列
export type Slot = { key: string; declared: Record<string, FieldSchema>; optional: string[]; given: string[]; events: SlotEvent[] };
export type SlotCode =
  | "unknown-target" | "keyed-mismatch" | "unknown-command" | "missing-field" | "unknown-field" | "bad-source" | "mismatch" | "no-output" | "missing-response" | "wrong-shape";
export type SlotReport = { key: string; code: SlotCode; field: string };

// スロットの鍵（extract が、判断を引くのに使う）
export const SLOT_KEY = {
  effect: (command: string, caseName: string, index: number) => `${command}|${caseName}|effect|${index}`,
  onlyWhen: (command: string, caseName: string, index: number) => `${command}|${caseName}|onlyWhen|${index}`,
  asks: (command: string, alias: string) => `${command}|asks|${alias}`,
  calls: (command: string, alias: string) => `${command}|calls|${alias}`,
  set: (command: string, caseName: string) => `${command}|${caseName}|set`,
  responds: (command: string, caseName: string) => `${command}|${caseName}|responds`,
  change: (command: string, caseName: string, index: number) => `${command}|${caseName}|change|${index}`,
  adds: (command: string, caseName: string, index: number) => `${command}|${caseName}|adds|${index}`,
  initially: (field: string) => `initially|${field}`,
};

const constantEvent = (value: Constant): ValueEvent =>
  typeof value === "string"
    ? { name: "Constant", input: { kind: "string", text: value, number: 0 } }
    : typeof value === "boolean"
      ? { name: "Constant", input: { kind: "boolean", text: "", number: 0 } }
      : Number.isFinite(value)
        ? { name: "Constant", input: { kind: Number.isInteger(value) ? "integer" : "number", text: "", number: value } }
        : { name: "Unresolved", input: {} };

// 値について分かっていること。構造を持つ型か、何でも入る値 (value) が絡むときは、Stage 0 が比べた結果 (Judged)
function* valueEvents(input: SpecInput, command: string, value: SpecValue, target: FieldSchema): Generator<ValueEvent> {
  if ((value as unknown) === null) return void (yield { name: "Null", input: {} });
  const judged = (): ValueEvent => ({ name: "Judged", input: { fits: mismatchOf(input, command, value, target) === undefined } });
  if (target === "value" || isStructured(target)) return void (yield judged());
  if (!isReference(value)) return void (yield typeof value === "object" ? judged() : constantEvent(value as Constant));
  const found = typeOfValue(input, command, value);
  if (found.problem) return void (yield { name: "Unresolved", input: {} });
  if (found.boolean) return void (yield { name: "Typed", input: { type: "boolean" } });
  if (found.values) {
    for (const cell of found.values) {
      if (cell === null) continue;
      yield typeof cell === "object" ? { name: "Judged", input: { fits: conforms(target, cell) } } : constantEvent(cell);
    }
    return;
  }
  const schema = found.schema!;
  if (isStructured(schema) || schema === "value") return void (yield { name: "Judged", input: { fits: compatible(schema, target) } });
  if (isEnum(schema)) for (const member of schema) yield constantEvent(member);
  else yield { name: "Typed", input: { type: kindOf(schema) as "boolean" | "integer" | "number" | "string" } };
}
const sourceOf = (value: SpecValue): "constant" | "input" | "data" | "other" =>
  !isReference(value) ? "constant" : value.$ref === "input" ? "input" : value.$ref === "data" ? "data" : "other";

const enter = (kind: SlotKind, facts: Partial<Extract<SlotEvent, { name: "EnterSlot" }>["input"]> = {}): SlotEvent => ({
  name: "EnterSlot",
  input: { kind, declared: true, keyedOk: true, commandDeclared: true, output: "none", given: "none", givenCount: 0, ...facts },
});

// 仕様の中のスロットすべて（順番は問わない。判断は鍵で引く）
export function slotsOf(input: SpecInput): Slot[] {
  const model = input.model;
  if (!model) return [];
  const slots: Slot[] = [];
  const add = (key: string, declared: Record<string, FieldSchema>, optional: string[], given: string[], events: SlotEvent[]) =>
    slots.push({ key, declared, optional, given, events: [...events, { name: "LeaveSlot", input: {} }] });
  for (const command of Object.keys(input.behaviors).sort()) {
    const behavior = input.behaviors[command];
    for (const [alias, asked] of Object.entries(behavior.asks ?? {})) {
      const query = model.queries[asked.query];
      const declared = query?.input ?? {};
      const events: SlotEvent[] = [enter("asks", { declared: query !== undefined })];
      for (const field of Object.keys(declared)) events.push({ name: "DeclaredField", input: { name: field } });
      for (const [field, value] of Object.entries(asked.input)) {
        events.push({ name: "GivenField", input: { name: field } }, { name: "Source", input: { kind: sourceOf(value) } });
        if (declared[field]) events.push(...valueEvents(input, command, value, declared[field]));
      }
      add(SLOT_KEY.asks(command, alias), declared, [], Object.keys(asked.input), events);
    }
    for (const [alias, call] of Object.entries(behavior.calls ?? {})) {
      const part = model.parts?.[call.part];
      const declared = part?.commands[call.command] ?? {};
      const events: SlotEvent[] = [
        enter("calls", { declared: part !== undefined, keyedOk: part === undefined || (part.by === undefined) === (call.key === undefined), commandDeclared: part?.commands[call.command] !== undefined }),
      ];
      for (const field of Object.keys(declared)) events.push({ name: "DeclaredField", input: { name: field } });
      for (const [field, value] of Object.entries(call.input)) {
        events.push({ name: "GivenField", input: { name: field } });
        if (declared[field]) events.push(...valueEvents(input, command, value, declared[field]));
      }
      add(SLOT_KEY.calls(command, alias), declared, [], Object.keys(call.input), events);
    }
    for (const caseName of Object.keys(behavior.when).sort()) {
      const outcome = behavior.when[caseName];
      for (const [index, effect] of outcome.effects.entries()) {
        const declared = model.effects[effect.name] ?? {};
        const events: SlotEvent[] = [enter("effect", { declared: model.effects[effect.name] !== undefined })];
        for (const field of Object.keys(declared)) events.push({ name: "DeclaredField", input: { name: field } });
        for (const [field, value] of Object.entries(effect.payload)) {
          events.push({ name: "GivenField", input: { name: field } });
          if (declared[field]) events.push(...valueEvents(input, command, value, declared[field]));
        }
        add(SLOT_KEY.effect(command, caseName, index), declared, [], Object.keys(effect.payload), events);
        if (effect.when !== undefined && typeof effect.when !== "string") {
          add(SLOT_KEY.onlyWhen(command, caseName, index), { "": "boolean" }, [], [""], [enter("onlyWhen"), { name: "GivenField", input: { name: "" } }, ...valueEvents(input, command, effect.when, "boolean")]);
        }
      }
      // 覚えるデータ
      const setEvents: SlotEvent[] = [enter("set")];
      for (const [field, value] of Object.entries(outcome.set)) {
        setEvents.push({ name: "GivenField", input: { name: field } });
        if (model.data[field]) setEvents.push(...valueEvents(input, command, value, model.data[field]));
      }
      add(SLOT_KEY.set(command, caseName), model.data, [], Object.keys(outcome.set), setEvents);
      // 返す値
      const output = model.outputs?.[command];
      const responded = respondedValues(outcome.responds, output);
      const given = outcome.responds === undefined ? "none" : responded.length === 1 && responded[0][0] === "" ? "single" : "fields";
      const shape = output === undefined ? "none" : isRecordOutput(output) ? "fields" : isOneOf(output) ? "variant" : "single";
      const declared: Record<string, FieldSchema> = isRecordOutput(output) ? output.record : output !== undefined && isOneOf(output) ? output.oneOf : output !== undefined ? { "": output as FieldSchema } : {};
      const optional = isRecordOutput(output) ? [...(output.optional ?? [])] : [];
      const values = new Map(responded);
      const respondEvents: SlotEvent[] = [enter("responds", { output: shape, given, givenCount: responded.length })];
      if (shape === "fields") {
        for (const field of Object.keys(declared)) {
          respondEvents.push({ name: "DeclaredField", input: { name: field } });
          if (values.has(field)) respondEvents.push({ name: "GivenField", input: { name: field } }, ...valueEvents(input, command, values.get(field)!, declared[field]));
        }
        for (const field of values.keys()) if (field !== "" && !(field in declared)) respondEvents.push({ name: "GivenField", input: { name: field } });
      } else {
        for (const [field, value] of responded) {
          respondEvents.push({ name: "GivenField", input: { name: field } });
          if (declared[field]) respondEvents.push(...valueEvents(input, command, value, declared[field]));
        }
      }
      add(SLOT_KEY.responds(command, caseName), declared, optional, [...values.keys()], respondEvents);
      // 多数ある部品を作る、消す
      for (const [index, change] of [...(outcome.adds ?? []), ...(outcome.removes ?? [])].entries()) {
        add(SLOT_KEY.change(command, caseName, index), {}, [], [], [enter("change", { declared: model.parts?.[change.part]?.by !== undefined })]);
      }
      for (const [index, added] of (outcome.adds ?? []).entries()) {
        const data = input.parts?.[added.part]?.model?.data ?? {};
        const events: SlotEvent[] = [enter("adds")];
        for (const [field, value] of Object.entries(added.data)) {
          events.push({ name: "GivenField", input: { name: field } });
          if (data[field]) events.push(...valueEvents(input, command, value, data[field]));
        }
        add(SLOT_KEY.adds(command, caseName, index), data, [], Object.keys(added.data), events);
      }
    }
  }
  for (const [field, value] of Object.entries(model.initial ?? {})) {
    add(SLOT_KEY.initially(field), { [field]: model.data[field] }, [], [field], [enter("initially"), { name: "GivenField", input: { name: field } }, ...valueEvents(input, "", value as SpecValue, model.data[field])]);
  }
  return slots;
}

// スロットの宣言について、部品が尋ねること（判断を持たない、宣言の読み出し）
export function slotQueries(slot: Slot) {
  const schema = (field: string) => slot.declared[field];
  const bounds = (field: string): { min?: number; max?: number } => {
    const declared = schema(field);
    return declared !== undefined && isNumberSchema(declared) ? declared : {};
  };
  return {
    fieldDeclared: ({ field }: { field: string }) => schema(field) !== undefined,
    fieldGiven: ({ field }: { field: string }) => slot.given.includes(field),
    fieldKind: ({ field }: { field: string }): FieldKind => (schema(field) === undefined ? "string" : fieldKindOf(schema(field))),
    fieldOptional: ({ field }: { field: string }) => slot.optional.includes(field) || (schema(field) !== undefined && isOptional(schema(field))),
    memberOf: ({ field, value }: { field: string; value: string }) => {
      const declared = schema(field);
      return declared !== undefined && isEnum(declared) && declared.includes(value);
    },
    hasMinimum: ({ field }: { field: string }) => bounds(field).min !== undefined,
    minimum: ({ field }: { field: string }) => bounds(field).min ?? 0,
    hasMaximum: ({ field }: { field: string }) => bounds(field).max !== undefined,
    maximum: ({ field }: { field: string }) => bounds(field).max ?? 0,
  };
}

// --- 判断 (Stage 0、手書き) ---
// フィールド1つにつき、報告は1つまで（最初のもの）。スロット全体の報告 (形、知らない相手) は、フィールド "" について
export function slotReportsStage0(slot: Slot): SlotReport[] {
  const ask = slotQueries(slot);
  const found: SlotReport[] = [];
  const report = (code: SlotCode, field: string) => found.push({ key: slot.key, code, field });
  let kind: SlotKind = "effect";
  let active = false;
  let variant = false;
  let field: string | undefined;
  let settled = true;
  const settle = (code: SlotCode) => {
    if (field === undefined || settled) return;
    report(code, field);
    settled = true;
  };
  const fits = (event: ValueEvent): boolean => {
    const takes = ask.fieldKind({ field: field! });
    switch (event.name) {
      case "Null":
        return ask.fieldOptional({ field: field! }) || takes === "value";
      case "Judged":
        return event.input.fits;
      case "Unresolved":
        return false;
      case "Typed":
        return takes === "value" || event.input.type === takes || (event.input.type === "integer" && takes === "number");
      case "Constant": {
        if (takes === "value") return true;
        const { kind: given, text, number } = event.input;
        const within = (!ask.hasMinimum({ field: field! }) || number >= ask.minimum({ field: field! })) && (!ask.hasMaximum({ field: field! }) || number <= ask.maximum({ field: field! }));
        if (takes === "boolean") return given === "boolean";
        if (takes === "string") return given === "string";
        if (takes === "enum") return given === "string" && ask.memberOf({ field: field!, value: text });
        if (takes === "integer") return given === "integer" && within;
        if (takes === "number") return (given === "integer" || given === "number") && within;
        return false;
      }
    }
  };
  for (const event of slot.events) {
    switch (event.name) {
      case "EnterSlot": {
        const facts = event.input;
        kind = facts.kind;
        variant = false;
        field = undefined;
        settled = true;
        active = true;
        if (kind === "effect" && !facts.declared) active = false;
        if (kind === "asks" && !facts.declared) [active] = [false, report("unknown-target", "")];
        if (kind === "change" && !facts.declared) report("unknown-target", "");
        if (kind === "calls") {
          if (!facts.declared) report("unknown-target", "");
          else if (!facts.keyedOk) report("keyed-mismatch", "");
          else if (!facts.commandDeclared) report("unknown-command", "");
          active = facts.declared && facts.keyedOk && facts.commandDeclared;
        }
        if (kind === "responds") {
          if (facts.output === "none") {
            if (facts.given !== "none") report("no-output", "");
            active = false;
          } else if (facts.given === "none") {
            report("missing-response", "");
            active = false;
          } else if (facts.output === "fields" && facts.given === "single") {
            report("wrong-shape", "");
            active = false;
          } else if (facts.output === "variant" && (facts.given !== "fields" || facts.givenCount !== 1)) {
            report("wrong-shape", "");
            active = false;
          } else if (facts.output === "single" && facts.given !== "single") {
            report("wrong-shape", "");
            active = false;
          }
          variant = facts.output === "variant";
        }
        break;
      }
      case "DeclaredField":
        if (active && ["effect", "asks", "calls", "responds"].includes(kind) && !ask.fieldGiven({ field: event.input.name })) report("missing-field", event.input.name);
        break;
      case "GivenField":
        if (!active) break;
        field = event.input.name;
        settled = false;
        if (!ask.fieldDeclared({ field })) {
          if (variant) {
            report("wrong-shape", "");
            settled = true;
          } else settle("unknown-field");
        }
        break;
      case "Source":
        // 出どころは、それが問題になる所（尋ねることの引数）でだけ渡す
        if (active && event.input.kind === "other") settle("bad-source");
        break;
      case "LeaveSlot":
        active = false;
        break;
      default:
        if (active && field !== undefined && !settled) {
          if (!fits(event)) settle("mismatch");
          // null が入るなら、その値はそれで決まる（そのあとに値は来ない）
        }
    }
  }
  return found;
}

// 文面のために、値が合わない理由（Stage 0 の言葉）
export const whyNot = (input: SpecInput, command: string, value: SpecValue, target: FieldSchema): string | undefined => mismatchOf(input, command, value, target);
