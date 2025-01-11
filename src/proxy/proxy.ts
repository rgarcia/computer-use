import websocket from "@fastify/websocket";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastify from "fastify";
import { type PrettyOptions } from "pino-pretty";
import WebSocket from "ws";

const pinoLoggerOptions = {
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l Z",
          } as PrettyOptions,
        }
      : undefined,
};

interface ServerConfig {
  listenPort: number;
  forwardPort: number;
}

export async function start(config: ServerConfig): Promise<FastifyInstance> {
  const server = fastify({
    logger: pinoLoggerOptions,
  });
  server.register(websocket);

  server.log.info({ ...config }, "Starting proxy server");
  setupWebDriverRoutes(server, "localhost", config.forwardPort);
  setupCDPRoutes(server, "localhost", config.forwardPort);
  await server.listen({ host: "0.0.0.0", port: config.listenPort });
  return server;
}

function once(fn: any) {
  let called = false;
  return (...args: any[]) => {
    if (called) return;
    called = true;
    return fn(...args);
  };
}

const wsProxy =
  (server: FastifyInstance, url: string) => (socket: WebSocket, req: any) => {
    // Parse the host and port from the URL
    const wsUrl = new URL(url);
    const headers = {
      ...req.headerrs,
      host: `${wsUrl.hostname}:${wsUrl.port}`, // override the host header to match the target host
    };

    server.log.info({ url, headers }, "proxying websocket connection");

    const wsClient = new WebSocket(url, { headers });

    const readyPromise = new Promise<void>((resolve) => {
      wsClient.on("open", () => {
        server.log.info("websocket client connected to browser");
        resolve();
      });
    });

    // Forward messages in both directions
    wsClient.on("message", async (data) => {
      await readyPromise;
      server.log.info(
        { message: tryJsonParse(data.toString()) },
        "proxying message from browser to client"
      );
      socket.send(data);
    });
    socket.on("message", async (data) => {
      await readyPromise;
      server.log.info(
        { message: tryJsonParse(data.toString()) },
        "proxying message from client to browser"
      );
      wsClient.send(data.toString());
    });

    // Handle connection closure from either end
    const cleanup = once(() => {
      server.log.info("closing websocket connection");
      socket.close();
      wsClient.close();
    });

    wsClient.on("close", (code, reason) => {
      server.log.info({ code, reason }, "browser websocket connection closed");
      cleanup();
    });
    socket.on("close", () => {
      server.log.info("client websocket connection closed");
      cleanup();
    });

    // Handle errors
    wsClient.on("error", (error) => {
      server.log.error({ error }, "Error in WebSocket proxy connection");
      cleanup();
    });
  };

function tryJsonParse(input: string) {
  try {
    const json = JSON.parse(input);
    if (json.result?.data && json.result.data.length > 100) {
      json.result.data =
        json.result.data.slice(0, 100) +
        `... (${json.result.data.length - 100} characters omitted)`;
    }
    return json;
  } catch (error) {
    return input;
  }
}

export function setupWebDriverRoutes(
  server: FastifyInstance,
  driverHostname: string,
  driverPort: number
) {
  // The beginning of a webdriver interaction starts with a POST request to create a session
  server.post("/session", async (req: FastifyRequest, reply: FastifyReply) => {
    const response = await fetch(
      `http://${driverHostname}:${driverPort}/session`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      }
    );
    reply.status(response.status).send(await response.json());
  });

  // the response to the POST request contains a session ID and a websocket URL to connect to
  // the client then establishes a websocket connection
  server.register(function (server: FastifyInstance) {
    server.get<{
      Params: { sessionId: string };
    }>(
      "/session/:sessionId",
      { websocket: true },
      (socket: WebSocket, req: any) => {
        wsProxy(
          server,
          `ws://${driverHostname}:${driverPort}/session/${req.params.sessionId}`
        )(socket, req);
      }
    );

    // additionally you can websocket directly to /session without first creating session
    // this is how puppeteer does it
    server.get(
      "/session",
      { websocket: true },
      (socket: WebSocket, req: any) => {
        wsProxy(server, `ws://${driverHostname}:${driverPort}/session`)(
          socket,
          req
        );
      }
    );
  });

  // webdriver commands can appear as POST and DELETE requests to the session/:id/{operation} endpoint
  server.route<{ Params: { "*": string } }>({
    method: ["POST", "DELETE"],
    url: "/session/*",
    handler: async (request, reply) => {
      try {
        const targetUrl = `http://${driverHostname}:${driverPort}/session/${request.params["*"]}`;
        request.log.info(`proxying ${request.method} request to ${targetUrl}`);
        const response = await fetch(targetUrl, {
          method: request.method,
          headers: {
            ...(request.headers as Record<string, string>),
          },
          body: JSON.stringify(request.body),
        });

        const responseData = await response.json();
        reply.status(response.status).send(responseData);
      } catch (error) {
        request.log.error(`Error proxying ${request.method} request:`, error);
        reply
          .status(500)
          .send({ error: `Failed to proxy ${request.method} request` });
      }
    },
  });

  // addContentTypeParser hack to fix the issue where webdriver client sends DELETE requests with content-type application/json with empty bodies
  server.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, payload, done) => {
      if (
        request.method === "DELETE" &&
        payload.length === 0 &&
        request.url.startsWith("/session")
      ) {
        payload = "{}";
      }
      return server.getDefaultJsonParser("ignore", "ignore")(
        request,
        payload.toString(),
        done
      );
    }
  );
}

export function setupCDPRoutes(
  server: FastifyInstance,
  driverHostname: string,
  driverPort: number
) {
  // Handle all /json/* endpoints
  server.route<{ Params: { "*": string } }>({
    method: ["GET", "PUT"],
    url: "/json/*",
    handler: async (request, reply) => {
      try {
        const targetUrl = `http://${driverHostname}:${driverPort}/json/${request.params["*"]}`;
        request.log.info(`proxying ${request.method} request to ${targetUrl}`);
        const response = await fetch(targetUrl, {
          method: request.method,
          headers: {
            ...(request.headers as Record<string, string>),
          },
        });

        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          reply.status(response.status).send(await response.json());
        } else {
          reply.status(response.status).send(await response.text());
        }
      } catch (error) {
        request.log.error(`Error proxying ${request.method} request:`, error);
        reply
          .status(500)
          .send({ error: `Failed to proxy ${request.method} request` });
      }
    },
  });

  // Handle /json root endpoint
  server.get("/json", async (request, reply) => {
    try {
      const response = await fetch(
        `http://${driverHostname}:${driverPort}/json`
      );
      reply.status(response.status).send(await response.json());
    } catch (error) {
      request.log.error("Error proxying /json request:", error);
      reply.status(500).send({ error: "Failed to proxy /json request" });
    }
  });

  // Handle all /devtools/* endpoints
  server.route<{ Params: { "*": string } }>({
    method: ["GET"],
    url: "/devtools/*",
    handler: async (request, reply) => {
      // Special handling for WebSocket endpoints
      if (request.params["*"].startsWith("page/")) {
        return; // Let the WebSocket handler take care of it
      }

      try {
        const targetUrl = `http://${driverHostname}:${driverPort}/devtools/${request.params["*"]}`;
        request.log.info(`proxying ${request.method} request to ${targetUrl}`);
        const response = await fetch(targetUrl, {
          method: request.method,
          headers: {
            ...(request.headers as Record<string, string>),
          },
        });

        reply.status(response.status).send(await response.text());
      } catch (error) {
        request.log.error(`Error proxying ${request.method} request:`, error);
        reply
          .status(500)
          .send({ error: `Failed to proxy ${request.method} request` });
      }
    },
  });

  // WebSocket endpoints for devtools protocol
  server.register(function (server: FastifyInstance) {
    server.get<{ Params: { "*": string } }>(
      "/devtools/page/*",
      { websocket: true },
      (socket: WebSocket, req: any) => {
        wsProxy(
          server,
          `ws://${driverHostname}:${driverPort}/devtools/page/${req.params["*"]}`
        )(socket, req);
      }
    );

    server.get<{ Params: { "*": string } }>(
      "/devtools/browser/*",
      { websocket: true },
      (socket: WebSocket, req: any) => {
        wsProxy(
          server,
          `ws://${driverHostname}:${driverPort}/devtools/browser/${req.params["*"]}`
        )(socket, req);
      }
    );
  });
}
