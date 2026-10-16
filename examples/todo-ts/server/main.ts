// The entry point of the to-do API, written by a person (version 0.1: the framework guarantees src/, not this file).
// It holds no decisions: it starts the server, gives the list its real dependency (identifiers), maps each request
// to a command of the list, and maps each answer to an HTTP response. The list lives in memory.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { TodoList } from "../src/index.ts";
import type { ListFilter } from "../src/index.ts";

const list = new TodoList({ nextId: () => randomUUID() });

const STATUS = {
  created: 201,
  invalid: 422,
  completed: 200,
  "already-done": 409,
  removed: 204,
  "not-found": 404,
} as const;

function send(response: ServerResponse, status: number, body?: unknown): void {
  response.writeHead(status, body === undefined ? {} : { "content-type": "application/json" });
  response.end(body === undefined ? undefined : `${JSON.stringify(body)}\n`);
}

async function json(request: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  let text = "";
  for await (const chunk of request) text += chunk;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const [, collection, id, action] = url.pathname.split("/");
  if (collection !== "todos") return send(response, 404, { error: "not found" });

  // POST /todos  { "title": "..." }
  if (request.method === "POST" && id === undefined) {
    const body = await json(request);
    if (typeof body?.title !== "string") return send(response, 400, { error: "the body must be { \"title\": string }" });
    const answer = list.add(body.title);
    return send(response, STATUS[answer.result], answer);
  }
  // GET /todos?only=all|open|done
  if (request.method === "GET" && id === undefined) {
    const only = url.searchParams.get("only") ?? "all";
    if (!["all", "open", "done"].includes(only)) return send(response, 400, { error: "only must be all, open or done" });
    return send(response, 200, list.list(only as ListFilter));
  }
  // POST /todos/:id/complete
  if (request.method === "POST" && id !== undefined && action === "complete") {
    const answer = list.complete(decodeURIComponent(id));
    return send(response, STATUS[answer], { result: answer });
  }
  // DELETE /todos/:id
  if (request.method === "DELETE" && id !== undefined && action === undefined) {
    const answer = list.remove(decodeURIComponent(id));
    return answer === "removed" ? send(response, STATUS[answer]) : send(response, STATUS[answer], { result: answer });
  }
  return send(response, 405, { error: "method not allowed" });
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`to-do API on http://localhost:${port}/todos`));
