import type { Command, Ports, StateName, TargetSystemAdapter } from "./todo-api.adapter.contract.ts";
import { TodoApiServer } from "../src/todo-api.ts";
import type { IdSource } from "../src/todo-api.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

let currentPorts: Ports | null = null;
let server: TodoApiServer | null = null;

async function startServer(ports: Ports): Promise<TodoApiServer> {
  // Forward every request for an identifier to the harness; exceptions reach the production code unchanged.
  const ids: IdSource = { newId: () => ports.queries["todos.newId"]() };
  return TodoApiServer.start({ port: 0, storagePath: ports.storage, ids });
}

async function stopServer(): Promise<void> {
  const running = server;
  server = null;
  if (running !== null) {
    await running.stop();
  }
}

async function send(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  if (server === null) {
    throw new Error("the system is not running");
  }
  const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text === "" ? null : JSON.parse(text) };
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    currentPorts = ports;
    server = await startServer(ports);
  },
  async teardownIsolation() {
    try {
      await stopServer();
    } finally {
      currentPorts = null;
    }
  },
  async executeCommand(command: Command) {
    switch (command.name) {
      case "CompleteTodo": {
        const { status } = await send("POST", `/todos/${encodeURIComponent(command.input.id)}/complete`);
        return { status };
      }
      case "DeleteTodo": {
        const { status } = await send("DELETE", `/todos/${encodeURIComponent(command.input.id)}`);
        return { status };
      }
      case "GetTodos": {
        const query = new URLSearchParams({ only: command.input.only });
        const { status, body } = await send("GET", `/todos?${query}`);
        return { status, body };
      }
      case "PostTodos": {
        const { status, body } = await send("POST", "/todos", command.input.body);
        return { status, body };
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    // The production code has a single state (specification state `READY`) and exposes no accessor for it.
    return "READY";
  },
  async restartSystem() {
    if (currentPorts === null) {
      throw new Error("the system is not running");
    }
    await stopServer();
    server = await startServer(currentPorts);
  },
};
