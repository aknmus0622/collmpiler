/**
 * HTTP server of the to-do list API, built on `node:http`.
 *
 * Routes (each served by the {@link TodoApi} method of the same specification command):
 *
 * - `POST /todos` with JSON body `{ "title": string }` → `PostTodos` ({@link TodoApi.postTodos})
 * - `GET /todos?only=all|open|done` → `GetTodos` ({@link TodoApi.getTodos})
 * - `POST /todos/:id/complete` → `CompleteTodo` ({@link TodoApi.completeTodo})
 * - `DELETE /todos/:id` → `DeleteTodo` ({@link TodoApi.deleteTodo})
 *
 * The status code of each response is the `status` the API method answered. When the answer has a
 * non-null `body`, it is sent as JSON (`Content-Type: application/json`); otherwise the response
 * has no body.
 */

/// <reference path="./nodeHttp.d.ts" />

import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { STATUS } from "./apiResponses.ts";
import type { IdSource } from "./idSource.ts";
import { TodoApi } from "./todoApi.ts";
import type { NewTodoBody } from "./todoApi.ts";
import type { ListFilter } from "./types.ts";

const LIST_FILTERS: readonly ListFilter[] = ["all", "open", "done"];

/** What a request asks for, once its method and path have been matched to a route. */
type Route =
  | { readonly kind: "postTodos" }
  | { readonly kind: "getTodos"; readonly only: string | null }
  | { readonly kind: "completeTodo"; readonly id: string }
  | { readonly kind: "deleteTodo"; readonly id: string };

/** The response to send: a status and, if not `null`, a JSON body. */
interface Reply {
  readonly status: number;
  readonly body?: unknown;
}

/** Matches a request's method and URL to a route; `null` if none matches. */
function matchRoute(method: string, rawUrl: string): Route | null {
  // The path is split by hand rather than through `URL`, which would normalise away empty and
  // dot segments that may be (part of) an item identifier.
  const withoutFragment = rawUrl.split("#")[0];
  const queryStart = withoutFragment.indexOf("?");
  const pathname = queryStart === -1 ? withoutFragment : withoutFragment.slice(0, queryStart);
  const query = new URLSearchParams(queryStart === -1 ? "" : withoutFragment.slice(queryStart + 1));
  const segments = pathname.split("/").slice(1).map(decodeURIComponent);
  if (segments[0] !== "todos") {
    return null;
  }
  if (segments.length === 1) {
    if (method === "POST") {
      return { kind: "postTodos" };
    }
    if (method === "GET") {
      return { kind: "getTodos", only: query.get("only") };
    }
    return null;
  }
  if (segments.length === 2 && method === "DELETE") {
    return { kind: "deleteTodo", id: segments[1] };
  }
  if (segments.length === 3 && segments[2] === "complete" && method === "POST") {
    return { kind: "completeTodo", id: segments[1] };
  }
  return null;
}

function isListFilter(value: string | null): value is ListFilter {
  return LIST_FILTERS.some((filter) => filter === value);
}

/** Parses a `POST /todos` body; `null` if it is not a JSON object with a string `title`. */
function parseNewTodoBody(text: string): NewTodoBody | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const title = (parsed as { title?: unknown }).title;
  return typeof title === "string" ? { title } : null;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      text += chunk;
    });
    request.on("end", () => resolve(text));
    request.on("error", reject);
  });
}

function send(response: ServerResponse, reply: Reply): void {
  if (reply.body === undefined || reply.body === null) {
    response.writeHead(reply.status);
    response.end();
    return;
  }
  const payload = JSON.stringify(reply.body);
  response.writeHead(reply.status, { "Content-Type": "application/json" });
  response.end(payload);
}

/** What the server needs from its environment. */
export interface TodoServerDependencies {
  /**
   * Where identifiers for new items come from (specification: the `newId` query of part `todos`).
   */
  readonly ids: IdSource;
}

export class TodoHttpServer {
  private readonly api: TodoApi;
  private readonly server: Server;
  private listeningPort: number | null = null;

  /**
   * Creates a server, not yet listening, around a new, empty to-do list.
   *
   * @param dependencies the environment; see {@link TodoServerDependencies}.
   */
  constructor(dependencies: TodoServerDependencies) {
    this.api = new TodoApi(dependencies.ids);
    this.server = createServer((request, response) => {
      this.handle(request).then(
        (reply) => send(response, reply),
        () => {
          response.destroy();
        },
      );
    });
  }

  private async handle(request: IncomingMessage): Promise<Reply> {
    const route = matchRoute(request.method ?? "", request.url ?? "/");
    const text = await readBody(request);
    if (route === null) {
      return { status: STATUS.notFound };
    }
    switch (route.kind) {
      case "postTodos": {
        const body = parseNewTodoBody(text);
        return body === null ? { status: STATUS.unprocessable } : this.api.postTodos(body);
      }
      case "getTodos":
        return isListFilter(route.only)
          ? this.api.getTodos(route.only)
          : { status: STATUS.unprocessable };
      case "completeTodo":
        return this.api.completeTodo(route.id);
      case "deleteTodo":
        return this.api.deleteTodo(route.id);
    }
  }

  /**
   * Starts listening.
   *
   * @param port the TCP port to listen on; `0` picks any free port.
   * @returns the port actually listened on, once the server is ready for requests.
   */
  start(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      this.server.once("error", onError);
      this.server.listen(port, () => {
        this.server.off("error", onError);
        const address = this.server.address();
        const listening = typeof address === "object" && address !== null ? address.port : port;
        this.listeningPort = listening;
        resolve(listening);
      });
    });
  }

  /**
   * The port the server listens on. Only valid after {@link start} has resolved.
   */
  get port(): number {
    if (this.listeningPort === null) {
      throw new Error("server is not listening");
    }
    return this.listeningPort;
  }

  /**
   * Stops listening and closes open connections.
   *
   * @returns resolves once the server is fully stopped.
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server.listening) {
        resolve();
        return;
      }
      this.server.close((error) => (error ? reject(error) : resolve()));
      this.server.closeAllConnections();
    });
  }
}

/**
 * Convenience: creates a {@link TodoHttpServer} with `dependencies` and starts it on `port`.
 *
 * @param port the TCP port to listen on; `0` picks any free port.
 * @returns the running server; read its {@link TodoHttpServer.port} to learn where it listens.
 */
export async function startTodoServer(
  dependencies: TodoServerDependencies,
  port: number,
): Promise<TodoHttpServer> {
  const server = new TodoHttpServer(dependencies);
  await server.start(port);
  return server;
}
