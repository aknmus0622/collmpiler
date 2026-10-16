import type { Command, Ports, StateName, TargetSystemAdapter } from "./todo-api.adapter.contract.ts";
import { routes } from "./todo-api.adapter.contract.ts";
import { TodoHttpServer } from "../src/httpServer.ts";
import type { IdSource } from "../src/idSource.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

let server: TodoHttpServer | undefined;
let baseUrl: string | undefined;

/** Builds the request for `command` from its route: path parameters, query string and JSON body. */
function toRequest(command: Command): { method: string; url: string; body: string | undefined } {
  const [method, pathTemplate] = routes[command.name].split(" ");
  const input = command.input as Record<string, unknown>;
  const used = new Set<string>();
  const path = pathTemplate.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
    used.add(name);
    return encodeURIComponent(String(input[name]));
  });
  const query = new URLSearchParams();
  let body: string | undefined;
  for (const [key, value] of Object.entries(input)) {
    if (used.has(key)) continue;
    if (key === "body") body = JSON.stringify(value);
    else query.append(key, String(value));
  }
  const qs = query.toString();
  return { method, url: `${baseUrl}${path}${qs ? `?${qs}` : ""}`, body };
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports: Ports) {
    const ids: IdSource = { nextId: () => ports.queries["todos.newId"]() };
    const created = new TodoHttpServer({ ids });
    const port = await created.start(0);
    server = created;
    baseUrl = `http://127.0.0.1:${port}`;
  },

  async teardownIsolation() {
    const running = server;
    server = undefined;
    baseUrl = undefined;
    if (running) await running.stop();
  },

  async executeCommand(command) {
    if (!baseUrl) throw new Error("adapter: the server is not running");
    const request = toRequest(command);
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: request.body,
    });
    const text = await response.text();
    const body = text.length > 0 ? JSON.parse(text) : null;
    switch (command.name) {
      case "PostTodos":
      case "GetTodos":
        return { status: response.status, body };
      case "CompleteTodo":
      case "DeleteTodo":
        return { status: response.status };
    }
  },

  async getCurrentState(): Promise<StateName> {
    // The production code has no states of its own; it is always in the specification state READY.
    return "READY";
  },
};
