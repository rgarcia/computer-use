import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { $ } from "bun";
import { describe, expect, test } from "bun:test";

describe("e2e tests", () => {
  let client: Client;
  let transport: StdioClientTransport;

  async function setupClient() {
    client = new Client(
      {
        name: "mcp test client",
        version: "0.1.0",
      },
      {
        capabilities: {
          sampling: {},
        },
      }
    );

    transport = new StdioClientTransport({
      command: "docker",
      args: [
        "run",
        "--rm",
        "-i",
        "--name",
        "mcp-test-container",
        "computer-use",
      ],
    });

    await client.connect(transport);

    // Wait a bit for the server to be fully ready
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  test("should connect to MCP server and list tools", async () => {
    await setupClient();

    const tools = await client.listTools();

    // Verify the tools exist and have correct names
    expect(tools.tools).toHaveLength(3);
    expect(tools.tools.map((t) => t.name)).toEqual([
      "bash_20241022",
      "computer_20241022",
      "edit_20241022",
    ]);

    // Test bash tool
    const bashResult = (await client.callTool({
      name: "bash_20241022",
      arguments: {
        command: "echo 'hello world'",
      },
    })) as CallToolResult;

    expect(bashResult.content[0].text).toBe("hello world");

    // Clean up
    await client.close();
    await transport.close();
    await $`docker kill mcp-test-container`;
  }, 60000); // 60s timeout

  test("should be able to take a screenshot", async () => {
    await setupClient();

    const result = (await client.callTool({
      name: "computer_20241022",
      arguments: {
        action: "screenshot",
      },
    })) as CallToolResult;

    // Verify we got an image content
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("image");
    const imageContent = result.content[0] as {
      type: "image";
      data: string;
      mimeType: string;
    };
    expect(imageContent.mimeType).toBe("image/png");

    // Verify the image is a valid base64 string
    const imageData = imageContent.data;
    expect(imageData).toBeTruthy();
    expect(typeof imageData === "string").toBe(true);
    expect(() => Buffer.from(imageData as string, "base64")).not.toThrow();

    // Clean up
    await client.close();
    await transport.close();
    await $`docker kill mcp-test-container`;
  }, 60000); // 60s timeout
});
