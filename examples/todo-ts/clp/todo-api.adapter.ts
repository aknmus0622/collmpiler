import type { Command, Ports, Query, TargetSystemAdapter } from "./todo-api.adapter.contract.ts";
import type { IdSource } from "../src/id-source.ts";
import { startTodoServer, type RunningTodoServer } from "../src/todo-server.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

let server: RunningTodoServer | undefined;

/** Sends one HTTP request to the running server and answers `{ status, body }` (`body` is `null` when empty). */
async function send(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  if (server === undefined) throw new Error("adapter: setupIsolation has not been called");
  const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text === "" ? null : JSON.parse(text) };
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports: Ports) {
    const ids: IdSource = { newId: () => ports.ids.NewId() };
    server = await startTodoServer({ ids, port: 0, host: "127.0.0.1" });
  },

  async teardownIsolation() {
    const running = server;
    server = undefined;
    if (running !== undefined) await running.stop();
  },

  async executeCommand(command: Command) {
    switch (command.name) {
      case "PostTodos": {
        const { status, body } = await send("POST", "/todos", command.input.body);
        return { status, body };
      }
      case "CompleteTodo": {
        const { status } = await send("POST", `/todos/${encodeURIComponent(command.input.id)}/complete`);
        return { status };
      }
      case "DeleteTodo": {
        const { status } = await send("DELETE", `/todos/${encodeURIComponent(command.input.id)}`);
        return { status };
      }
    }
  },

  async executeQuery(query: Query) {
    const path = `/todos?only=${encodeURIComponent(query.input.only)}`;
    switch (query.name) {
      case "GetTodos": {
        const { status, body } = await send("GET", path);
        return { status, body };
      }
      case "todos.List": {
        // The server owns its TodoList and exposes it only through GET /todos, whose body is
        // what `todos.list(only)` answered, in its order.
        const { body } = await send("GET", path);
        return body;
      }
    }
  },
};
