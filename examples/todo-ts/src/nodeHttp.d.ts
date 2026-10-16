/**
 * The part of Node's `node:http` module the server uses, declared here because the project does
 * not depend on Node's type definitions.
 */

declare module "node:http" {
  interface AddressInfo {
    readonly address: string;
    readonly family: string;
    readonly port: number;
  }

  interface IncomingMessage {
    readonly method?: string;
    readonly url?: string;
    setEncoding(encoding: "utf8"): this;
    on(event: "data", listener: (chunk: string) => void): this;
    on(event: "end", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }

  interface ServerResponse {
    writeHead(statusCode: number, headers?: Record<string, string | number>): this;
    end(data?: string): this;
    destroy(error?: Error): this;
  }

  interface Server {
    readonly listening: boolean;
    listen(port: number, listener: () => void): this;
    address(): AddressInfo | string | null;
    close(callback: (error?: Error) => void): this;
    closeAllConnections(): void;
    once(event: "error", listener: (error: Error) => void): this;
    off(event: "error", listener: (error: Error) => void): this;
  }

  function createServer(
    listener: (request: IncomingMessage, response: ServerResponse) => void,
  ): Server;
}
