// The composition root of the persistent to-do API, written by a person. Everything else (the store on node:sqlite,
// the list, the HTTP server) is production code written by agents and verified, including across restarts.
// This file only gives it its real dependencies: where the data lives, identifiers, and a port.
import { randomUUID } from "node:crypto";
import { startTodoApi } from "../src/todo-api.ts";

const location = process.env.TODO_DB ?? "todos.sqlite";
const server = await startTodoApi({ port: Number(process.env.PORT ?? 3000), location, ids: { newId: () => randomUUID() } });
console.log(`to-do API on http://localhost:${server.port}/todos (data in ${location})`);
