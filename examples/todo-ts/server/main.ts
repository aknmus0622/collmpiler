// The composition root of the to-do API, written by a person. The server itself (routes, status codes, the
// connection to the list) is production code written by an agent and verified over HTTP (src/httpServer.ts).
// This file only gives it its real dependency (identifiers) and a port.
import { randomUUID } from "node:crypto";
import { TodoHttpServer } from "../src/httpServer.ts";

const server = new TodoHttpServer({ ids: { nextId: () => randomUUID() } });
const port = await server.start(Number(process.env.PORT ?? 3000));
console.log(`to-do API on http://localhost:${port}/todos`);
