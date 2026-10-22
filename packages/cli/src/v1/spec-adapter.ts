// An adapter whose "production system" is the spec itself, evaluated (eval.ts). With it, the glue that puts the
// framework's questions to a generated component (stage1.ts) can put them to the component's spec instead: whether the
// spec of a self component decides what its Stage 0 decides can be known before any code is generated.

import { FAILED, answer, execute, fromPlain, initialWorld, plain } from "./eval.ts";
import type { World } from "./eval.ts";
import type { Ir8 } from "./ir.ts";
import type { Adapter8 } from "./pbt.ts";
import { entryName } from "./pbt.ts";

export function specAdapter(ir: Ir8): Adapter8 {
  let world: World | undefined;
  let ports: Record<string, Record<string, (input?: Record<string, unknown>) => unknown>> = {};
  const answers = (component: string, query: string, args: Record<string, unknown>) => {
    const fn = ports[component]?.[query];
    if (!fn) throw new Error(`ports.${component}.${query} がありません`);
    try {
      const port = ir.components[component].external!.queries[query];
      return fromPlain(fn(plain(args) as Record<string, unknown>), port.result);
    } catch {
      return FAILED;
    }
  };
  const find = (name: string) => {
    const qualified = [...ir.entries.commands, ...ir.entries.queries].find((q) => entryName(ir, q) === name) ?? `${ir.root}.${name}`;
    const [component, port] = qualified.split(".");
    return { component, port };
  };
  const typed = (params: Record<string, import("./ir.ts").Type>, input: Record<string, unknown>) => Object.fromEntries(Object.entries(params).map(([k, t]) => [k, fromPlain(input[k], t)]));
  return {
    async setupIsolation(given) {
      ports = given as typeof ports;
      world = initialWorld(ir);
    },
    async teardownIsolation() {
      world = undefined;
    },
    async executeCommand({ name, input }) {
      const { component, port } = find(name);
      const params = ir.components[component].commands![port].params;
      const result = execute(ir, world!, component, port, typed(params, input), answers);
      world = result.world;
      for (const effect of result.effects) {
        const [target, command] = effect.port.split(".");
        ports[target]?.[command]?.(plain(effect.args) as Record<string, unknown>);
      }
      return result.output === undefined ? undefined : plain(result.output);
    },
    async executeQuery({ name, input }) {
      const { component, port } = find(name);
      const params = ir.components[component].queries![port].params;
      return plain(answer(ir, world!, component, port, typed(params, input), answers));
    },
  };
}
