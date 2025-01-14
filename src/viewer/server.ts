import type { eventWithTime } from "@rrweb/types";
import { existsSync } from "fs";

interface EventsSink {
  push(event: eventWithTime): void;
  get(): eventWithTime[];
}

class InMemoryEventsSink implements EventsSink {
  private events: eventWithTime[] = [];

  push(event: eventWithTime): void {
    this.events.push(event);
  }

  get(): eventWithTime[] {
    return this.events;
  }
}

const eventsSink = new InMemoryEventsSink();

Bun.serve({
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/event") {
      const event = (await req.json()) as eventWithTime;
      eventsSink.push(event);
      return new Response("OK");
    } else if (req.method === "GET" && url.pathname === "/events") {
      return new Response(JSON.stringify(eventsSink.get()));
    } else {
      const pathname = new URL(req.url).pathname;
      const path =
        pathname === "/"
          ? "./dist/viewer/index.html"
          : `./dist/viewer${pathname}`;
      if (existsSync(path)) {
        const file = Bun.file(path);
        return new Response(file);
      }
      return new Response("Not found", { status: 404 });
    }
  },
  port: process.env.PORT ?? 3000,
});
