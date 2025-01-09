import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { BashTool } from "./bash.js";
import { handleComputerAction } from "./computer.js";
import { handleEditAction } from "./edit.js";

// Create tool instances
const bashTool = new BashTool(120000); // 2 minute timeout for production use

// Tool definitions matching Anthropic's expected names
const TOOLS: Tool[] = [
  {
    name: "bash_20241022",
    description: "Run a bash command and persist shell session across commands",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The command to execute",
        },
        restart: {
          type: "boolean",
          description: "Whether to restart the shell session",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "computer_20241022",
    description: "Control computer UI elements using xdotool",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: `The action to perform. The available actions are:
* \`key\`: Press a key or key-combination on the keyboard.
  - This supports xdotool's \`key\` syntax.
  - Examples: "a", "Return", "alt+Tab", "ctrl+s", "Up", "KP_0" (for the numpad 0 key).
* \`type\`: Type a string of text on the keyboard.
* \`cursor_position\`: Get the current (x, y) pixel coordinate of the cursor on the screen.
* \`mouse_move\`: Move the cursor to a specified (x, y) pixel coordinate on the screen.
* \`left_click\`: Click the left mouse button.
* \`left_click_drag\`: Click and drag the cursor to a specified (x, y) pixel coordinate on the screen.
* \`right_click\`: Click the right mouse button.
* \`middle_click\`: Click the middle mouse button.
* \`double_click\`: Double-click the left mouse button.
* \`screenshot\`: Take a screenshot of the screen.`,
          enum: [
            "key",
            "type",
            "mouse_move",
            "left_click",
            "left_click_drag",
            "right_click",
            "middle_click",
            "double_click",
            "screenshot",
            "cursor_position",
          ],
        },
        coordinate: {
          type: "array",
          description:
            "(x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates to move the mouse to. Required only by `action=mouse_move` and `action=left_click_drag`.",
        },
        text: {
          type: "string",
          description: "Required only by `action=type` and `action=key`.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "edit_20241022",
    description: "Edit files in the filesystem",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "The action to perform (read, write, etc)",
        },
        path: {
          type: "string",
          description: "Path to the file",
        },
        content: {
          type: "string",
          description: "Content to write (for write actions)",
        },
      },
      required: ["action", "path"],
    },
  },
];

// Create server instance
const server = new Server(
  {
    name: "mcp-computer-use",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Set up request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "bash_20241022": {
        const { command = null, restart = false } = request.params
          .arguments as { command?: string | null; restart?: boolean };
        return await bashTool.runCommand(command, restart);
      }
      case "computer_20241022": {
        const { action, coordinate, text } = request.params.arguments as {
          action: string;
          coordinate?: number[];
          text?: string;
        };
        console.error("DEBUG", action, coordinate, text);
        const debug = await handleComputerAction({
          action,
          args: { coordinate, text },
        });
        console.error("DEBUG", debug);
        return debug;
      }
      case "edit_20241022": {
        const { action, path, content } = request.params.arguments as {
          action: string;
          path: string;
          content?: string;
        };
        return await handleEditAction({ action, path, content });
      }
      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${request.params.name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Computer Use MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
