/**
 * The HTTP server of the to-do API (specification `routes` of component `todo-api`).
 *
 * Serves, with `node:http`:
 * - `POST /todos` — JSON body `{ "title": string }` → {@link TodoApi.postTodos}
 * - `POST /todos/:id/complete` → {@link TodoApi.completeTodo}
 * - `DELETE /todos/:id` → {@link TodoApi.deleteTodo}
 * - `GET /todos?only=all|open|done` → {@link TodoApi.getTodos}
 *
 * Each response's status is the answered `status`; when the answer has a non-null `body`, it is
 * sent as JSON (`content-type: application/json`), otherwise the response has no body.
 *
 * Not durable: a newly started server starts with an empty list.
 */
/// <reference types="node" />
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Buffer } from "node:buffer";
import type { IdSource } from "./id-source.ts";
import { TodoApi } from "./todo-api.ts";
import type { NewTodoBody } from "./todo-api.ts";
import { TodoList } from "./todo-list.ts";
import { TODO_FILTERS } from "./todo.ts";
import type { TodoFilter } from "./todo.ts";

/** What {@link startTodoServer} needs. */
export interface TodoServerOptions {
  /**
   * Where identifiers of new items come from (specification external component `ids`); asked
   * once each time an item is created.
   */
  readonly ids: IdSource;
  /** The TCP port to listen on; `0` picks any free port. */
  readonly port: number;
  /** The host to listen on; defaults to all interfaces when omitted. */
  readonly host?: string;
}

/** A server that is listening. */
export interface RunningTodoServer {
  /** The port the server actually listens on (useful when started with port `0`). */
  readonly port: number;
  /** Stops accepting connections and resolves once the server is closed. */
  stop(): Promise<void>;
}

/**
 * Starts the API: creates a new, empty `TodoList` using `options.ids`, wraps it in a `TodoApi`
 * and serves the routes above.
 *
 * @returns once the server is listening.
 */
export function startTodoServer(options: TodoServerOptions): Promise<RunningTodoServer> {
  const api = new TodoApi(new TodoList(options.ids));
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handle(api, req)
      .then((answer) => send(res, answer))
      .catch(() => send(res, { status: 500, body: null }));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      const address = server.address() as { readonly port: number };
      resolve({
        port: address.port,
        stop: () =>
          new Promise<void>((done, fail) => {
            server.close((err?: Error) => (err ? fail(err) : done()));
            server.closeAllConnections();
          }),
      });
    });
  });
}

/** What a request is answered with: a status and, unless `null`/absent, a JSON body. */
interface Answer {
  readonly status: number;
  readonly body?: unknown;
}

/** Routes one request to the matching API operation. */
async function handle(api: TodoApi, req: IncomingMessage): Promise<Answer> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const segments = url.pathname.split("/").filter((s) => s !== "").map(decodeURIComponent);
  const method = req.method ?? "GET";

  if (segments.length === 1 && segments[0] === "todos") {
    if (method === "GET") {
      const only = url.searchParams.get("only") ?? "all";
      if (!isTodoFilter(only)) return { status: 400, body: null };
      return api.getTodos(only);
    }
    if (method === "POST") {
      const body = parseJson(await readBody(req));
      if (!isNewTodoBody(body)) return { status: 400, body: null };
      return api.postTodos({ title: body.title });
    }
    return { status: 405, body: null };
  }
  if (segments.length === 2 && segments[0] === "todos") {
    if (method === "DELETE") return api.deleteTodo(segments[1]);
    return { status: 405, body: null };
  }
  if (segments.length === 3 && segments[0] === "todos" && segments[2] === "complete") {
    if (method === "POST") return api.completeTodo(segments[1]);
    return { status: 405, body: null };
  }
  return { status: 404, body: null };
}

function send(res: ServerResponse, answer: Answer): void {
  if (answer.body === undefined || answer.body === null) {
    res.writeHead(answer.status);
    res.end();
    return;
  }
  const text = JSON.stringify(answer.body);
  res.writeHead(answer.status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isNewTodoBody(value: unknown): value is NewTodoBody {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { title?: unknown }).title === "string"
  );
}

function isTodoFilter(value: string): value is TodoFilter {
  return (TODO_FILTERS as readonly string[]).includes(value);
}
