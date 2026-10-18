/// <reference types="node" />
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { Todos } from "./todos.ts";
import type { AddResult, IdSource, ListFilter, RemoveResult, Todo, TodoCompleteResult } from "./todos.ts";

export type { IdSource, ListFilter, Todo } from "./todos.ts";

/**
 * The answer of a command that responds with a status only (specification outputs of `CompleteTodo` and
 * `DeleteTodo`). Over HTTP it is sent with no response body.
 */
export interface StatusResponse {
  /** The HTTP response status code (specification output field `status`). */
  status: number;
}

/** The answer of {@link TodoApi.getTodos} (specification output of the command `GetTodos`). */
export interface GetTodosResponse {
  /** The HTTP response status code (specification output field `status`). */
  status: number;
  /** The items the list answered, in its order (specification output field `body`), sent as the JSON body. */
  body: Todo[];
}

/** The answer of {@link TodoApi.postTodos} (specification output of the command `PostTodos`). */
export interface PostTodosResponse {
  /** The HTTP response status code (specification output field `status`). */
  status: number;
  /**
   * The new item, sent as the JSON body; `null` when the response has no body (specification output field
   * `body`, which is optional).
   */
  body: Todo | null;
}

/** The JSON request body of `POST /todos` (specification input `body` of the command `PostTodos`). */
export interface PostTodosBody {
  /** The title of the item to add (specification input `body.title`), passed to the list as given. */
  title: string;
}

/**
 * Pure function: the response of `CompleteTodo` for what the list answered to its `Complete` command
 * (specification `call:todos.Complete`).
 *
 * @param result the answer of {@link Todos.complete}
 */
export function completeTodoResponse(result: TodoCompleteResult): StatusResponse {
  switch (result) {
    case "not-found":
      return { status: 404 };
    case "already-done":
      return { status: 409 };
    case "completed":
      return { status: 200 };
  }
}

/**
 * Pure function: the response of `DeleteTodo` for what the list answered to its `Remove` command
 * (specification `call:todos.Remove`).
 *
 * @param result the answer of {@link Todos.remove}
 */
export function deleteTodoResponse(result: RemoveResult): StatusResponse {
  return result === "not-found" ? { status: 404 } : { status: 204 };
}

/**
 * Pure function: the response of `GetTodos` for what the list answered to its `List` command
 * (specification `call:todos.List`).
 *
 * @param todos the answer of {@link Todos.list}
 */
export function getTodosResponse(todos: readonly Todo[]): GetTodosResponse {
  return { status: 200, body: todos.map((todo) => ({ id: todo.id, title: todo.title, done: todo.done })) };
}

/**
 * Pure function: the response of `PostTodos` for what the list answered to its `Add` command
 * (specification `call:todos.Add`).
 *
 * @param added the answer of {@link Todos.add}
 */
export function postTodosResponse(added: AddResult): PostTodosResponse {
  switch (added.result) {
    case "invalid":
      return { status: 422, body: null };
    case "unavailable":
      return { status: 503, body: null };
    case "created":
      return { status: 201, body: added.todo };
  }
}

/**
 * The HTTP API of the to-do list (specification component `todo-api`), without the HTTP transport.
 *
 * It has a single state (specification state `READY`) and remembers nothing of its own: every method passes
 * the request to the contained list (specification part `todos`, a {@link Todos}) and turns the list's answer
 * into the response. Everything durable is kept by the list.
 *
 * Usage:
 * ```ts
 * const api = new TodoApi(Todos.open("/var/lib/todos.db", ids));
 * const created = api.postTodos({ title: "Buy milk" }); // { status, body: { id, title, done } | null }
 * api.completeTodo(created.body!.id);                    // { status }
 * api.getTodos("open");                                  // { status, body: [...] }
 * api.deleteTodo(created.body!.id);                      // { status }
 * ```
 */
export class TodoApi {
  private readonly todos: Todos;

  /**
   * @param todos the to-do list every request is passed to (specification part `todos`)
   */
  constructor(todos: Todos) {
    this.todos = todos;
  }

  /**
   * Performs the specification command `CompleteTodo` (route `POST /todos/:id/complete`): asks the list to
   * complete the item (its {@link Todos.complete}) and answers the matching response.
   *
   * @param id the identifier of the item (specification input `id`, the `:id` path segment)
   */
  completeTodo(id: string): StatusResponse {
    return completeTodoResponse(this.todos.complete(id));
  }

  /**
   * Performs the specification command `DeleteTodo` (route `DELETE /todos/:id`): asks the list to remove the
   * item (its {@link Todos.remove}) and answers the matching response.
   *
   * @param id the identifier of the item (specification input `id`, the `:id` path segment)
   */
  deleteTodo(id: string): StatusResponse {
    return deleteTodoResponse(this.todos.remove(id));
  }

  /**
   * Performs the specification command `GetTodos` (route `GET /todos`): asks the list for its items (its
   * {@link Todos.list}) and answers them. Changes nothing.
   *
   * @param only which items to answer (specification input `only`, the `only` query-string parameter)
   */
  getTodos(only: ListFilter): GetTodosResponse {
    return getTodosResponse(this.todos.list(only));
  }

  /**
   * Performs the specification command `PostTodos` (route `POST /todos`): asks the list to add an item with
   * the title of the body (its {@link Todos.add}, which may ask the {@link IdSource} for an identifier) and
   * answers the matching response.
   *
   * @param body the JSON request body (specification input `body`)
   */
  postTodos(body: PostTodosBody): PostTodosResponse {
    return postTodosResponse(this.todos.add(body.title));
  }
}

/** What {@link TodoApiServer.start} needs to run the API. */
export interface TodoApiServerOptions {
  /** The TCP port to listen on; `0` for any free one (see {@link TodoApiServer.port} for the one chosen). */
  port: number;
  /**
   * Filesystem path of the SQLite database file where the list keeps its items. Starting again on the same
   * path comes back with every item kept there before.
   */
  storagePath: string;
  /** The source of identifiers for new items (specification query `newId` of the part `todos`). */
  ids: IdSource;
}

/**
 * The to-do list's HTTP server (Node's `node:http`): serves each command of {@link TodoApi} at its route,
 * reading `:id` from the path, `only` from the query string and the JSON request body, and writing the
 * command's `status` as the response status code and its `body` (when there is one) as the JSON response body.
 *
 * Usage:
 * ```ts
 * const server = await TodoApiServer.start({ port: 0, storagePath: "/var/lib/todos.db", ids });
 * fetch(`http://localhost:${server.port}/todos?only=all`);
 * await server.stop();
 * ```
 */
export class TodoApiServer {
  private readonly server: Server;
  private readonly todos: Todos;

  private constructor(server: Server, todos: Todos) {
    this.server = server;
    this.todos = todos;
  }

  /**
   * Opens the list on `options.storagePath`, starts listening on `options.port`, and resolves once the
   * server accepts requests.
   *
   * @param options the port, the storage location and the identifier source
   */
  static start(options: TodoApiServerOptions): Promise<TodoApiServer> {
    const todos = Todos.open(options.storagePath, options.ids);
    const api = new TodoApi(todos);
    const server = createServer((request, response) => {
      serve(api, request, response);
    });
    return new Promise((resolve, reject) => {
      const onError = (error: Error): void => {
        todos.close();
        reject(error);
      };
      server.once("error", onError);
      server.listen(options.port, () => {
        server.off("error", onError);
        resolve(new TodoApiServer(server, todos));
      });
    });
  }

  /** The TCP port the server actually listens on (the one chosen by the system when started with `0`). */
  get port(): number {
    const address = this.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("the server is not listening on a TCP port");
    }
    return address.port;
  }

  /**
   * Stops accepting requests, waits for the server to close, and closes the list's storage. Everything kept
   * stays at the storage location; start again on it to continue.
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        this.todos.close();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
      this.server.closeAllConnections();
    });
  }
}

/** What to write back for one request: its status code and its JSON body (`undefined` for no body). */
interface HttpAnswer {
  status: number;
  body?: unknown;
}

/** Every value the `only` query-string parameter of `GET /todos` may have. */
const LIST_FILTERS: readonly string[] = ["all", "open", "done"];

/** Reads the whole request body as text. */
function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

/** The body of `POST /todos` in `text`, or `null` when it is not a JSON object with a string `title`. */
function parsePostTodosBody(text: string): PostTodosBody | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const title = (parsed as { title?: unknown }).title;
  return typeof title === "string" ? { title } : null;
}

/** Passes one request to the command at its route and answers what the command answered. */
async function route(api: TodoApi, request: IncomingMessage): Promise<HttpAnswer> {
  const url = new URL(request.url ?? "/", "http://localhost");
  let segments: string[];
  try {
    segments = url.pathname.split("/").slice(1).map((segment) => decodeURIComponent(segment));
  } catch {
    return { status: 400 };
  }
  const method = request.method;
  if (segments.length === 1 && segments[0] === "todos") {
    if (method === "GET") {
      const only = url.searchParams.get("only");
      return only !== null && LIST_FILTERS.includes(only) ? api.getTodos(only as ListFilter) : { status: 400 };
    }
    if (method === "POST") {
      const body = parsePostTodosBody(await readBody(request));
      if (body === null) {
        return { status: 400 };
      }
      const answer = api.postTodos(body);
      return answer.body === null ? { status: answer.status } : answer;
    }
    return { status: 405 };
  }
  if (segments.length === 2 && segments[0] === "todos") {
    return method === "DELETE" ? api.deleteTodo(segments[1]) : { status: 405 };
  }
  if (segments.length === 3 && segments[0] === "todos" && segments[2] === "complete") {
    return method === "POST" ? api.completeTodo(segments[1]) : { status: 405 };
  }
  return { status: 404 };
}

/** Serves one request over HTTP. */
function serve(api: TodoApi, request: IncomingMessage, response: ServerResponse): void {
  route(api, request).then(
    (answer) => write(response, answer),
    () => write(response, { status: 500 }),
  );
}

/** Writes `answer` as the response: its status code and, when it has one, its body as JSON. */
function write(response: ServerResponse, answer: HttpAnswer): void {
  if (answer.body === undefined) {
    response.writeHead(answer.status);
    response.end();
    return;
  }
  const text = JSON.stringify(answer.body);
  response.writeHead(answer.status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  response.end(text);
}
