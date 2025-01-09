import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

Server;
StdioServerTransport;
CallToolRequestSchema;
ListToolsRequestSchema;
const A_TOOL: Tool = {
  name: "a_tool",
  description: "a_tool_description",
  inputSchema: {
    type: "object",
  },
};
