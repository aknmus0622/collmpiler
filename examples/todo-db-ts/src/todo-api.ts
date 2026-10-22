/// <reference types="node" />
import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import type { Server, ServerResponse } from "node:http";
import { URL } from "node:url";
import type { Json } from "./json.ts";
import { Store } from "./store.ts";
import { Todos } from "./todos.ts";
import type {
  AddResult,
  CompleteOutcome,
  IdSource,
  ListFilter,
  RemoveOutcome,
  Todo,
  TodoId,
} from "./todos.ts";

export type { IdSource, ListFilter, Todo, TodoId } from "./todos.ts";

/**
 * An HTTP response the API answers: the specification's `{ status }` / `{ status, body }` outputs of
 * the `todo-api` commands and query.
 */
export interface ApiResponse {
  /** The HTTP status code (the specification's `status`). */
  status: number;
  /**
   * The JSON response body (the specification's `body`). `null` or absent means the response has no
   * body at all (nothing is written, not even `null`).
   */
  body?: ResponseBody;
}

/** What a response body can be: any JSON value, including the list's items written as JSON. */
export type ResponseBody = Json | Todo | Todo[];

/** The JSON request body of `POST /todos`: the specification's `PostTodos` parameter `body`. */
export interface NewTodoBody {
  /** The title of the item to add, passed to {@link Todos.add} as given. */
  title: string;
}

/** The answer of {@link TodoApi.postTodos}: the specification's `PostTodos` output. */
export interface PostTodosResponse extends ApiResponse {
  /** The created item, or `null` when no item was created. */
  body: Todo | null;
}

/** The answer of {@link TodoApi.getTodos}: the specification's `GetTodos` output. */
export interface GetTodosResponse extends ApiResponse {
  /** The listed items, in the list's order. */
  body: Todo[];
}

/**
 * Pure decision: the response for an outcome of {@link Todos.add} (the specification's `PostTodos`
 * events).
 *
 * @param added what the list answered to the add
 * @returns the status and body the API answers
 */
export function postTodosResponse(added: AddResult): PostTodosResponse {
  if (added.result === "created") return { status: 201, body: added.todo };
  if (added.result === "invalid") return { status: 422, body: null };
  return { status: 503, body: null };
}

/**
 * Pure decision: the response for an outcome of {@link Todos.complete} (the specification's
 * `CompleteTodo` events).
 *
 * @param outcome what the list answered to the complete
 * @returns the status the API answers (no body)
 */
export function completeTodoResponse(outcome: CompleteOutcome): ApiResponse {
  if (outcome === "completed") return { status: 200 };
  if (outcome === "not-found") return { status: 404 };
  return { status: 409 };
}

/**
 * Pure decision: the response for an outcome of {@link Todos.remove} (the specification's `DeleteTodo`
 * events).
 *
 * @param outcome what the list answered to the remove
 * @returns the status the API answers (no body)
 */
export function deleteTodoResponse(outcome: RemoveOutcome): ApiResponse {
  if (outcome === "removed") return { status: 204 };
  return { status: 404 };
}

/**
 * Pure calculation: the response for the listed items (the specification's calculation `get`).
 *
 * @param listed the items {@link Todos.list} answered
 * @returns the status and body the API answers
 */
export function getTodosResponse(listed: Todo[]): GetTodosResponse {
  return { status: 200, body: listed };
}

/**
 * The `todo-api` component, without the HTTP transport: each method performs one of the specification's
 * entries by passing it to the contained list ({@link Todos}) and turning the list's answer into a
 * response. It has no state of its own; everything it remembers is the list's (and so the store's).
 *
 * Specification mapping:
 * - command `PostTodos(body)` → {@link TodoApi.postTodos} — route `POST /todos`
 * - command `CompleteTodo(id)` → {@link TodoApi.completeTodo} — route `POST /todos/:id/complete`
 * - command `DeleteTodo(id)` → {@link TodoApi.deleteTodo} — route `DELETE /todos/:id`
 * - query `GetTodos(only)` → {@link TodoApi.getTodos} — route `GET /todos?only=…`
 */
export class TodoApi {
  readonly #todos: Todos;

  /**
   * @param todos the list every request is passed to; each command calls exactly one of its commands,
   *   once, and the query only reads it
   */
  constructor(todos: Todos) {
    this.#todos = todos;
  }

  /**
   * Performs `PostTodos`: asks the list to add an item with the body's title ({@link Todos.add}).
   *
   * @param body the parsed JSON request body (spec parameter `body`)
   * @returns the response, with the new item as body when one was created
   */
  postTodos(body: NewTodoBody): PostTodosResponse {
    return postTodosResponse(this.#todos.add(body.title));
  }

  /**
   * Performs `CompleteTodo`: asks the list to complete the item ({@link Todos.complete}).
   *
   * @param id the item's identifier, from the path segment `:id` (spec parameter `id`)
   * @returns the response (status only)
   */
  completeTodo(id: TodoId): ApiResponse {
    return completeTodoResponse(this.#todos.complete(id));
  }

  /**
   * Performs `DeleteTodo`: asks the list to remove the item ({@link Todos.remove}).
   *
   * @param id the item's identifier, from the path segment `:id` (spec parameter `id`)
   * @returns the response (status only)
   */
  deleteTodo(id: TodoId): ApiResponse {
    return deleteTodoResponse(this.#todos.remove(id));
  }

  /**
   * Answers `GetTodos`: the list's items as asked ({@link Todos.list}). Changes nothing.
   *
   * @param only which items to answer, from the query-string parameter `only` (spec parameter `only`)
   * @returns the response, with the items as body
   */
  getTodos(only: ListFilter): GetTodosResponse {
    return getTodosResponse(this.#todos.list(only));
  }
}

/** A request as received over HTTP, before it is routed. */
export interface ApiRequest {
  /** The HTTP method, upper case (`"GET"`, `"POST"`, `"DELETE"`, …). */
  method: string;
  /** The request URL's path, without the query string (for example `/todos/abc/complete`). */
  path: string;
  /** The query-string parameters, by name (the first value of each). */
  query: Readonly<Record<string, string>>;
  /** The parsed JSON request body, or `null` when there is none. */
  body: Json;
}

/**
 * Routes one request to the {@link TodoApi} method its route names (see {@link TodoApi} for the
 * routes), decoding `:id` from the path, `only` from the query string and `body` from the JSON body.
 * A request that matches no route, or whose inputs are not of the expected shape, is answered without
 * reaching the list (such requests are outside the specification).
 *
 * @param api the API the request is passed to
 * @param request the received request
 * @returns the response to send
 */
export function routeRequest(api: TodoApi, request: ApiRequest): ApiResponse {
  const segments = request.path.split("/").slice(1);
  if (segments[0] !== "todos") return NOT_FOUND;
  if (segments.length === 1) {
    if (request.method === "POST") {
      const body = request.body;
      if (!isNewTodoBody(body)) return BAD_REQUEST;
      return api.postTodos({ title: body.title });
    }
    if (request.method === "GET") {
      const only = request.query["only"];
      if (!isListFilter(only)) return BAD_REQUEST;
      return api.getTodos(only);
    }
    return METHOD_NOT_ALLOWED;
  }
  const id = decodeSegment(segments[1]);
  if (id === null) return NOT_FOUND;
  if (segments.length === 2) {
    if (request.method === "DELETE") return api.deleteTodo(id);
    return METHOD_NOT_ALLOWED;
  }
  if (segments.length === 3 && segments[2] === "complete") {
    if (request.method === "POST") return api.completeTodo(id);
    return METHOD_NOT_ALLOWED;
  }
  return NOT_FOUND;
}

/** Answer to a request that matches no route. */
const NOT_FOUND: ApiResponse = { status: 404 };
/** Answer to a request on a known path with a method it does not serve. */
const METHOD_NOT_ALLOWED: ApiResponse = { status: 405 };
/** Answer to a request whose inputs are not of the expected shape. */
const BAD_REQUEST: ApiResponse = { status: 400 };
/** Answer when handling a request failed unexpectedly. */
const INTERNAL_ERROR: ApiResponse = { status: 500 };

/** Every {@link ListFilter}, as the query-string parameter `only` may give it. */
const LIST_FILTERS: readonly string[] = ["all", "open", "done"] satisfies ListFilter[];

function isListFilter(value: string | undefined): value is ListFilter {
  return value !== undefined && LIST_FILTERS.includes(value);
}

function isNewTodoBody(body: Json): body is { title: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    typeof body["title"] === "string"
  );
}

/** Decodes a percent-encoded path segment, or `null` if it is malformed. */
function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Parses a raw HTTP request into an {@link ApiRequest} and routes it. */
function handleRaw(api: TodoApi, method: string, url: string, rawBody: string): ApiResponse {
  const parsed = new URL(url, "http://localhost");
  const query: Record<string, string> = {};
  for (const [name, value] of parsed.searchParams) {
    if (!(name in query)) query[name] = value;
  }
  let body: Json = null;
  if (rawBody.trim() !== "") {
    try {
      body = JSON.parse(rawBody) as Json;
    } catch {
      return BAD_REQUEST;
    }
  }
  return routeRequest(api, { method: method.toUpperCase(), path: parsed.pathname, query, body });
}

/** Writes a response: its JSON body if it has one, otherwise no body at all. */
function writeResponse(res: ServerResponse, response: ApiResponse): void {
  if (response.body === undefined || response.body === null) {
    res.writeHead(response.status);
    res.end();
    return;
  }
  const text = JSON.stringify(response.body);
  res.writeHead(response.status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

/** What {@link startTodoApi} needs to run the API. */
export interface TodoApiOptions {
  /**
   * The TCP port to listen on; `0` lets the system pick any free port (read it back from
   * {@link RunningTodoApi.port}).
   */
  port: number;
  /**
   * Path of the SQLite database file where the list's items are kept (the durable `store`). Starting
   * again on the same path, for example after a crash or a stop, sees the same items.
   */
  location: string;
  /**
   * The source of identifiers (the specification's external `ids`): asked by the list for each new
   * item's identifier while handling `POST /todos`; it may throw when unavailable.
   */
  ids: IdSource;
}

/** A started HTTP API, as {@link startTodoApi} answers it. */
export interface RunningTodoApi {
  /** The port the server actually listens on (the chosen one when started with port `0`). */
  readonly port: number;
  /**
   * Stops listening, waits for open connections to end, and closes the store. What was kept stays at
   * the location. Resolves once everything is closed.
   */
  stop(): Promise<void>;
}

/**
 * Serves a {@link TodoApi} over HTTP: parses each request into an {@link ApiRequest}, passes it to
 * {@link routeRequest}, and writes the {@link ApiResponse} back (JSON body with
 * `content-type: application/json` when there is one).
 *
 * @param api the API to serve
 * @param port the port to listen on (`0` for any free one)
 * @returns the listening Node HTTP server, once it listens
 */
export function serveTodoApi(api: TodoApi, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      let response: ApiResponse;
      try {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        response = handleRaw(api, req.method ?? "GET", req.url ?? "/", rawBody);
      } catch {
        response = INTERNAL_ERROR;
      }
      writeResponse(res, response);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

/**
 * Starts the whole system: opens the {@link Store} at `options.location`, builds the {@link Todos}
 * list on it with `options.ids`, and serves its {@link TodoApi} over HTTP on `options.port`.
 *
 * @param options the port, the storage location and the identifier source
 * @returns the running API, once it listens
 */
export async function startTodoApi(options: TodoApiOptions): Promise<RunningTodoApi> {
  const store = Store.open(options.location);
  let server: Server;
  try {
    server = await serveTodoApi(new TodoApi(new Todos(store, options.ids)), options.port);
  } catch (error) {
    store.close();
    throw error;
  }
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;
  return {
    port,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          store.close();
          if (error) reject(error);
          else resolve();
        });
        server.closeIdleConnections();
      }),
  };
}
