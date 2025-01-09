import { spawn } from "child_process";
import { mkdir, readFile } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

const OUTPUT_DIR = "/tmp/outputs";
const TYPING_DELAY_MS = 12;
const TYPING_GROUP_SIZE = 50;

type Action =
  | "key"
  | "type"
  | "mouse_move"
  | "left_click"
  | "left_click_drag"
  | "right_click"
  | "middle_click"
  | "double_click"
  | "screenshot"
  | "cursor_position";

interface Resolution {
  width: number;
  height: number;
}

// sizes above XGA/WXGA are not recommended (see README.md)
// scale down to one of these targets if scaling is enabled
const MAX_SCALING_TARGETS: Record<string, Resolution> = {
  XGA: { width: 1024, height: 768 }, // 4:3
  WXGA: { width: 1280, height: 800 }, // 16:10
  FWXGA: { width: 1366, height: 768 }, // ~16:9
};

enum ScalingSource {
  COMPUTER = "computer",
  API = "api",
}

interface ComputerToolOptions {
  display_height_px: number;
  display_width_px: number;
  display_number: number | null;
}

interface ComputerToolArgs {
  coordinate?: number[];
  text?: string;
}

async function chunks(s: string, chunkSize: number): Promise<string[]> {
  return Array.from({ length: Math.ceil(s.length / chunkSize) }, (_, i) =>
    s.slice(i * chunkSize, (i + 1) * chunkSize)
  );
}

export class ComputerTool {
  private width: number;
  private height: number;
  private displayNum: number | null;
  private displayPrefix: string;
  private xdotool: string;
  private screenshotDelay = 2.0;
  private scalingEnabled = true;

  constructor() {
    this.width = parseInt(process.env.WIDTH || "0", 10);
    this.height = parseInt(process.env.HEIGHT || "0", 10);

    if (!this.width || !this.height) {
      throw new Error("WIDTH, HEIGHT must be set");
    }

    const displayNum = process.env.DISPLAY_NUM;
    if (displayNum !== null && displayNum !== undefined) {
      this.displayNum = parseInt(displayNum, 10);
      this.displayPrefix = `DISPLAY=:${this.displayNum} `;
    } else {
      this.displayNum = null;
      this.displayPrefix = "";
    }

    this.xdotool = `${this.displayPrefix}xdotool`;
  }

  private getOptions(): ComputerToolOptions {
    const [width, height] = this.scaleCoordinates(
      ScalingSource.COMPUTER,
      this.width,
      this.height
    );
    return {
      display_width_px: width,
      display_height_px: height,
      display_number: this.displayNum,
    };
  }

  private scaleCoordinates(
    source: ScalingSource,
    x: number,
    y: number
  ): [number, number] {
    if (!this.scalingEnabled) {
      return [x, y];
    }

    const ratio = this.width / this.height;
    let targetDimension: Resolution | null = null;

    for (const dimension of Object.values(MAX_SCALING_TARGETS)) {
      // allow some error in the aspect ratio - not all ratios are exactly 16:9
      if (Math.abs(dimension.width / dimension.height - ratio) < 0.02) {
        if (dimension.width < this.width) {
          targetDimension = dimension;
          break;
        }
      }
    }

    if (!targetDimension) {
      return [x, y];
    }

    const xScalingFactor = targetDimension.width / this.width;
    const yScalingFactor = targetDimension.height / this.height;

    if (source === ScalingSource.API) {
      if (x > this.width || y > this.height) {
        throw new Error(`Coordinates ${x}, ${y} are out of bounds`);
      }
      // scale up
      return [Math.round(x / xScalingFactor), Math.round(y / yScalingFactor)];
    }
    // scale down
    return [Math.round(x * xScalingFactor), Math.round(y * yScalingFactor)];
  }

  private async shell(command: string, takeScreenshot = true) {
    return new Promise<{
      output?: string;
      error?: string;
      base64_image?: string;
    }>(async (resolve, reject) => {
      const proc = spawn(command, { shell: true });
      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", async (code) => {
        let base64Image: string | undefined;

        if (takeScreenshot) {
          // delay to let things settle before taking a screenshot
          await new Promise((r) => setTimeout(r, this.screenshotDelay * 1000));
          const screenshot = await this.screenshot();
          base64Image = screenshot.base64_image;
        }

        resolve({
          output: stdout || undefined,
          error: stderr || undefined,
          base64_image: base64Image,
        });
      });

      proc.on("error", reject);
    });
  }

  private async screenshot() {
    await mkdir(OUTPUT_DIR, { recursive: true });
    const path = join(OUTPUT_DIR, `screenshot_${uuidv4()}.png`);

    // Try gnome-screenshot first
    let screenshotCmd = `${this.displayPrefix}gnome-screenshot -f ${path} -p`;
    let result = await this.shell(screenshotCmd, false);

    // Fall back to scrot if gnome-screenshot isn't available
    if (result.error) {
      screenshotCmd = `${this.displayPrefix}scrot -p ${path}`;
      result = await this.shell(screenshotCmd, false);
    }

    if (this.scalingEnabled) {
      const [x, y] = this.scaleCoordinates(
        ScalingSource.COMPUTER,
        this.width,
        this.height
      );
      await this.shell(`convert ${path} -resize ${x}x${y}! ${path}`, false);
    }

    try {
      const imageBuffer = await readFile(path);
      return {
        ...result,
        base64_image: imageBuffer.toString("base64"),
      };
    } catch (error) {
      throw new Error(`Failed to take screenshot: ${error}`);
    }
  }

  async handleAction({
    action,
    args,
  }: {
    action: Action;
    args: ComputerToolArgs;
  }) {
    const { text, coordinate } = args;

    if (action === "mouse_move" || action === "left_click_drag") {
      if (!coordinate) {
        throw new Error(`coordinate is required for ${action}`);
      }
      if (text) {
        throw new Error(`text is not accepted for ${action}`);
      }
      if (!Array.isArray(coordinate) || coordinate.length !== 2) {
        throw new Error(`${coordinate} must be a tuple of length 2`);
      }
      if (!coordinate.every((i) => typeof i === "number" && i >= 0)) {
        throw new Error(`${coordinate} must be a tuple of non-negative ints`);
      }

      const [x, y] = this.scaleCoordinates(
        ScalingSource.API,
        coordinate[0],
        coordinate[1]
      );

      if (action === "mouse_move") {
        return await this.shell(`${this.xdotool} mousemove --sync ${x} ${y}`);
      } else {
        return await this.shell(
          `${this.xdotool} mousedown 1 mousemove --sync ${x} ${y} mouseup 1`
        );
      }
    }

    if (action === "key" || action === "type") {
      if (!text) {
        throw new Error(`text is required for ${action}`);
      }
      if (coordinate) {
        throw new Error(`coordinate is not accepted for ${action}`);
      }
      if (typeof text !== "string") {
        throw new Error(`${text} must be a string`);
      }

      if (action === "key") {
        return await this.shell(`${this.xdotool} key -- ${text}`);
      } else {
        const results = [];
        for (const chunk of await chunks(text, TYPING_GROUP_SIZE)) {
          const cmd = `${this.xdotool} type --delay ${TYPING_DELAY_MS} -- ${chunk}`;
          results.push(await this.shell(cmd, false));
        }
        const screenshot = await this.screenshot();
        return {
          output: results.map((r) => r.output).join(""),
          error: results.map((r) => r.error).join(""),
          base64_image: screenshot.base64_image,
        };
      }
    }

    if (
      [
        "left_click",
        "right_click",
        "double_click",
        "middle_click",
        "screenshot",
        "cursor_position",
      ].includes(action)
    ) {
      if (text) {
        throw new Error(`text is not accepted for ${action}`);
      }
      if (coordinate) {
        throw new Error(`coordinate is not accepted for ${action}`);
      }

      if (action === "screenshot") {
        return await this.screenshot();
      }

      if (action === "cursor_position") {
        const result = await this.shell(
          `${this.xdotool} getmouselocation --shell`,
          false
        );
        const output = result.output || "";
        const [x, y] = this.scaleCoordinates(
          ScalingSource.COMPUTER,
          parseInt(output.split("X=")[1].split("\n")[0], 10),
          parseInt(output.split("Y=")[1].split("\n")[0], 10)
        );
        return {
          ...result,
          output: `X=${x},Y=${y}`,
        };
      }

      const clickArg = {
        left_click: "1",
        right_click: "3",
        middle_click: "2",
        double_click: "--repeat 2 --delay 500 1",
      }[action];

      return await this.shell(`${this.xdotool} click ${clickArg}`);
    }

    throw new Error(`Invalid action: ${action}`);
  }
}

export async function handleComputerAction({
  action,
  args,
}: {
  action: string;
  args: ComputerToolArgs;
}) {
  try {
    const tool = new ComputerTool();
    const result = await tool.handleAction({
      action: action as Action,
      args,
    });

    // For screenshot action, return ImageContentSchema
    if (action === "screenshot" && result.base64_image) {
      return {
        content: [
          {
            type: "image",
            data: result.base64_image,
            mimeType: "image/png",
          },
        ],
        isError: false,
      };
    }

    // For all other actions, return TextContentSchema
    return {
      content: [
        {
          type: "text",
          text: result.output || "",
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
