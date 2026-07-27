import http from "node:http";
import type { Socket } from "node:net";

/**
 * A pass-through HTTP proxy in front of the app, used to sever a live SSE
 * connection the way a real network failure does.
 *
 * Chromium's offline emulation (`BrowserContext.setOffline`) only refuses new
 * requests; an established streaming response keeps flowing, so it cannot test
 * a dropped stream. Destroying the socket underneath the browser can.
 */
export interface SeverableProxy {
  /** Origin the browser should load, e.g. http://127.0.0.1:41234 */
  origin: string;
  /** Destroy every live socket, killing streams mid-response. */
  sever(): void;
  /** While blocked, new connections are refused immediately. */
  block(on: boolean): void;
  close(): Promise<void>;
}

// Headers that describe one hop and must not be forwarded verbatim.
const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade"]);

function forwardable(headers: http.IncomingHttpHeaders): http.IncomingHttpHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !HOP_BY_HOP.has(name.toLowerCase())),
  );
}

export async function startProxy(targetUrl: string): Promise<SeverableProxy> {
  const target = new URL(targetUrl);
  const sockets = new Set<Socket>();
  let blocked = false;

  const server = http.createServer((request, response) => {
    if (blocked) {
      response.socket?.destroy();
      return;
    }

    const upstream = http.request(
      {
        host: target.hostname,
        port: target.port || 80,
        path: request.url,
        method: request.method,
        headers: { ...forwardable(request.headers), host: target.host },
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, forwardable(upstreamResponse.headers));
        upstreamResponse.pipe(response);
      },
    );

    upstream.on("error", () => response.destroy());
    request.pipe(upstream);
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("proxy failed to bind");

  return {
    origin: `http://127.0.0.1:${address.port}`,
    sever() {
      for (const socket of sockets) socket.destroy();
    },
    block(on: boolean) {
      blocked = on;
    },
    close() {
      for (const socket of sockets) socket.destroy();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
