import { spawn, type ChildProcess } from "child_process";

class BashSession {
  private process: ChildProcess | null = null;
  private timeoutMs: number;

  constructor(timeoutMs: number = 120000) {
    this.timeoutMs = timeoutMs;
    this.startShell();
  }

  private startShell() {
    // Start a new bash session
    const proc = spawn("/bin/bash", [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    if (!proc.stdout || !proc.stderr || !proc.stdin) {
      throw new Error("Failed to create shell process");
    }

    this.process = proc;

    // Handle process exit
    this.process.on("exit", (_code) => {
      this.process = null;
    });
  }

  async restart(): Promise<void> {
    const oldProcess = this.process;
    if (oldProcess) {
      oldProcess.kill();
      // Wait for the process to exit
      await new Promise<void>((resolve) => {
        oldProcess.on("exit", () => resolve());
      });
    }
    this.startShell();
  }

  async runCommand(command: string): Promise<string> {
    if (!this.process) {
      this.startShell();
    }

    return new Promise((resolve, reject) => {
      const proc = this.process;
      if (!proc?.stdin || !proc.stdout || !proc.stderr) {
        reject(new Error("Shell process not running"));
        return;
      }

      let buffer = "";
      const marker = `\nCMD_DONE_${Date.now()}\n`;
      let timeoutId: ReturnType<typeof setTimeout>;

      // Handle stdout data
      const handleOutput = (data: Buffer) => {
        buffer += data.toString();
        if (buffer.includes(marker)) {
          const [output] = buffer.split(marker);
          cleanup();
          resolve(output.trim());
        }
      };

      // Set up event handlers
      proc.stdout.on("data", handleOutput);
      proc.stderr.on("data", handleOutput);

      // Clean up resources and kill any running processes
      const cleanup = () => {
        clearTimeout(timeoutId);
        proc.stdout?.removeListener("data", handleOutput);
        proc.stderr?.removeListener("data", handleOutput);
      };

      // Write command to shell
      proc.stdin.write(command + "\n");
      proc.stdin.write(`echo "${marker}"\n`);

      // Set timeout
      timeoutId = setTimeout(async () => {
        cleanup();
        await this.restart();
        reject(new Error("Command timed out"));
      }, this.timeoutMs);
    });
  }
}

export interface CommandResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError: boolean;
}

export class BashTool {
  private session: BashSession;

  constructor(timeoutMs: number = 120000) {
    this.session = new BashSession(timeoutMs);
  }

  async runCommand(
    command: string | null,
    restart: boolean = false
  ): Promise<CommandResult> {
    try {
      if (restart) {
        await this.session.restart();
        return {
          content: [
            {
              type: "text",
              text: "Shell session restarted",
            },
          ],
          isError: false,
        };
      }

      if (!command) {
        throw new Error("No command provided");
      }

      const output = await this.session.runCommand(command);
      return {
        content: [
          {
            type: "text",
            text: output,
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
}
