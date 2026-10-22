import type {
  Command,
  CommandOutput,
  Json,
  Ports,
  Query,
  QueryOutput,
  TargetSystemAdapter,
} from "./todo-api.adapter.contract.ts";
import { routes } from "./todo-api.adapter.contract.ts";
import { Store } from "../src/store.ts";
import { startTodoApi } from "../src/todo-api.ts";
import type { RunningTodoApi } from "../src/todo-api.ts";
import { Todos } from "../src/todos.ts";
import type { IdSource } from "../src/todos.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

let ports: Ports | undefined;
let running: RunningTodoApi | undefined;

/** The production `IdSource`, forwarding to the harness's `ids` port (exceptions pass through). */
function idSource(p: Ports): IdSource {
  return { newId: () => p.ids.NewId() };
}

async function start(): Promise<void> {
  if (ports === undefined) throw new Error("adapter: setupIsolation was not called");
  running = await startTodoApi({ port: 0, location: ports.storage, ids: idSource(ports) });
}

async function stop(): Promise<void> {
  const current = running;
  running = undefined;
  if (current !== undefined) await current.stop();
}

/** Sends one routed request to the running server and answers `{ status, body }`. */
async function send(
  route: string,
  input: Record<string, unknown>,
): Promise<{ status: number; body: Json }> {
  if (running === undefined) throw new Error("adapter: the system is not running");
  const [method, pattern] = route.split(" ") as [string, string];
  const rest: Record<string, unknown> = { ...input };
  const path = pattern.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => {
    const value = rest[name];
    delete rest[name];
    return encodeURIComponent(String(value));
  });
  const hasBody = "body" in rest;
  const body = rest.body;
  delete rest.body;
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(rest)) search.append(name, String(value));
  const query = search.toString();
  const url = `http://127.0.0.1:${running.port}${path}${query === "" ? "" : `?${query}`}`;
  const response = await fetch(url, {
    method,
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text === "" ? null : (JSON.parse(text) as Json) };
}

/** Opens the store at the system's storage location for the duration of `use`. */
function withStore<T>(use: (store: Store) => T): T {
  if (ports === undefined) throw new Error("adapter: setupIsolation was not called");
  const store = Store.open(ports.storage);
  try {
    return use(store);
  } finally {
    store.close();
  }
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(p) {
    ports = p;
    running = undefined;
    await start();
  },
  async teardownIsolation() {
    try {
      await stop();
    } finally {
      ports = undefined;
    }
  },
  async executeCommand(command: Command) {
    switch (command.name) {
      case "PostTodos": {
        const { status, body } = await send(routes.PostTodos, command.input);
        return { status, body } as CommandOutput["PostTodos"];
      }
      case "CompleteTodo": {
        const { status } = await send(routes.CompleteTodo, command.input);
        return { status } satisfies CommandOutput["CompleteTodo"];
      }
      case "DeleteTodo": {
        const { status } = await send(routes.DeleteTodo, command.input);
        return { status } satisfies CommandOutput["DeleteTodo"];
      }
    }
  },
  async executeQuery(query: Query) {
    switch (query.name) {
      case "GetTodos": {
        const { status, body } = await send(routes.GetTodos, query.input);
        return { status, body } as QueryOutput["GetTodos"];
      }
      case "todos.List": {
        const p = ports!;
        return withStore((store) =>
          new Todos(store, idSource(p)).list(query.input.only),
        ) satisfies QueryOutput["todos.List"];
      }
      case "store.Entries": {
        return withStore((store) => store.entries()) as QueryOutput["store.Entries"];
      }
    }
  },
  async restartSystem() {
    await stop();
    await start();
  },
};
