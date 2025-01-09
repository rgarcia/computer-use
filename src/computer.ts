interface ComputerAction {
  action: string;
  args: Record<string, any>;
}

async function runXdoTool(args: string[]): Promise<string> {
  const proc = Bun.spawn(["xdotool", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Get stdout and stderr as text
  const [output, error] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exitCode;
  if (exitCode !== 0) {
    throw new Error(`xdotool failed: ${error}`);
  }

  return output.trim();
}

export async function handleComputerAction({ action, args }: ComputerAction) {
  try {
    let result: string;

    switch (action) {
      case "click": {
        const { x, y, button = 1 } = args;
        if (typeof x !== "number" || typeof y !== "number") {
          throw new Error("Click requires x and y coordinates");
        }
        await runXdoTool(["mousemove", x.toString(), y.toString()]);
        result = await runXdoTool(["click", button.toString()]);
        break;
      }

      case "type": {
        const { text } = args;
        if (typeof text !== "string") {
          throw new Error("Type requires text argument");
        }
        result = await runXdoTool(["type", text]);
        break;
      }

      case "key": {
        const { key } = args;
        if (typeof key !== "string") {
          throw new Error("Key requires key argument");
        }
        result = await runXdoTool(["key", key]);
        break;
      }

      case "getMouseLocation": {
        result = await runXdoTool(["getmouselocation"]);
        break;
      }

      case "getWindowFocus": {
        result = await runXdoTool(["getwindowfocus"]);
        break;
      }

      case "windowActivate": {
        const { window } = args;
        if (typeof window !== "string" && typeof window !== "number") {
          throw new Error("windowActivate requires window argument");
        }
        result = await runXdoTool(["windowactivate", window.toString()]);
        break;
      }

      case "windowSize": {
        const { window, width, height } = args;
        if (
          !window ||
          typeof width !== "number" ||
          typeof height !== "number"
        ) {
          throw new Error(
            "windowSize requires window, width, and height arguments"
          );
        }
        result = await runXdoTool([
          "windowsize",
          window.toString(),
          width.toString(),
          height.toString(),
        ]);
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return {
      content: [
        {
          type: "text",
          text: result || "Action completed successfully",
        },
      ],
      isError: false,
    };
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
}
