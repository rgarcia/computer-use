import { $, spawn, type Subprocess } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { FastifyInstance } from "fastify";
import { start } from "./proxy";

const hasChromium = (await $`which chromium`.quiet()).exitCode === 0;
const hasTsx = (await $`which tsx`.quiet()).exitCode === 0;

describe.if(hasChromium && hasTsx)("chromium proxy tests", () => {
  let chromium: Subprocess<"inherit", "inherit", "inherit">;
  let server: FastifyInstance;
  const CHROMIUM_PORT = 9221;
  const PROXY_PORT = 9222;

  beforeAll(async () => {
    // Start chromium with remote debugging
    chromium = spawn(
      [
        "chromium",
        `--remote-debugging-port=${CHROMIUM_PORT}`,
        "--headless",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--remote-allow-origins=*",
        "--no-zygote",
      ],
      {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      }
    );

    // Wait a bit for chromium to start
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Start proxy server
    server = await start({
      listenPort: PROXY_PORT,
      forwardPort: CHROMIUM_PORT,
    });
  });

  afterAll(async () => {
    await server?.close();
    chromium?.kill();
  });

  test("playwright can connect through proxy", async () => {
    // Note: We use tsx here because Bun's Node.js compatibility layer
    // doesn't work well with Playwright
    const result =
      await $`tsx src/scripts/playwright.ts http://localhost:${PROXY_PORT}/`.quiet();
    expect(result.exitCode).toBe(0);
  }, 10000);

  test("puppeteer can connect through proxy", async () => {
    const result =
      await $`bun run src/scripts/puppeteer.ts http://localhost:${PROXY_PORT}/`.quiet();
    expect(result.exitCode).toBe(0);
  }, 10000);
});
