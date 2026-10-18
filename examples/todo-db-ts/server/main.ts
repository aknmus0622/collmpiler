// The composition root of the persistent to-do API, written by a person. Everything else (the store on node:sqlite,
// the list, the HTTP server) is production code written by agents and verified, including across restarts.
// This file only gives it its real dependencies: where the data lives, identifiers, and a port.
import { randomUUID } from "node:crypto";
import { TodoApiServer } from "../src/todo-api.ts";

const server = await TodoApiServer.start({
  port: Number(process.env.PORT ?? 3000),
  storagePath: process.env.TODO_DB ?? "todos.sqlite",
  ids: { newId: () => randomUUID() },
});
console.log(`to-do API on http://localhost:${server.port}/todos (data in ${process.env.TODO_DB ?? "todos.sqlite"})`);
