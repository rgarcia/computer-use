import { describe, expect, test } from "bun:test";
import { BashTool } from "./bash";

describe("bash tool", () => {
  const bash = new BashTool(2000); // 2 second timeout for tests

  test("should execute a simple command", async () => {
    const result = await bash.runCommand("echo 'hello world'");
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe("hello world");
  });

  test("should handle environment variables", async () => {
    // First set a variable
    await bash.runCommand("export TEST_VAR='test value'");
    // Then read it back
    const result = await bash.runCommand("echo $TEST_VAR");
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe("test value");
  });

  test("should maintain working directory", async () => {
    // Create a temp directory and cd into it
    await bash.runCommand("mkdir -p /tmp/bash-test");
    await bash.runCommand("cd /tmp/bash-test");

    // Create a file in the new directory
    await bash.runCommand("echo 'test' > test.txt");

    // Read the file and verify it exists
    const result = await bash.runCommand("cat test.txt");
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe("test");

    // Clean up
    await bash.runCommand("cd /");
    await bash.runCommand("rm -rf /tmp/bash-test");
  });

  test("should handle command errors", async () => {
    const result = await bash.runCommand("nonexistentcommand 2>&1");
    expect(result.content[0].text).toContain("command not found");
  });

  test("should handle restart flag", async () => {
    // Set a variable
    await bash.runCommand("export TEST_VAR='test value'");

    // Verify it's set
    let result = await bash.runCommand("echo $TEST_VAR");
    expect(result.content[0].text).toBe("test value");

    // Restart the shell
    result = await bash.runCommand(null, true);
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe("Shell session restarted");

    // Verify the variable is no longer set
    result = await bash.runCommand("echo $TEST_VAR");
    expect(result.content[0].text).toBe("");
  });

  test("should handle multiline output", async () => {
    const result = await bash.runCommand("echo 'line 1\nline 2\nline 3'");
    expect(result.isError).toBe(false);
    expect(result.content[0].text.split("\n")).toHaveLength(3);
    expect(result.content[0].text).toBe("line 1\nline 2\nline 3");
  });

  test("should handle long-running commands", async () => {
    const result = await bash.runCommand("sleep 1; echo 'done'");
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe("done");
  });

  test("should timeout on hung commands", async () => {
    const result = await bash.runCommand("sleep 31"); // Longer than our 2s timeout
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error: Command timed out");
  }, 5000);

  test("should handle stderr output", async () => {
    const result = await bash.runCommand(`echo "error message" 1>&2`);
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe("error message");
  });

  test("should reject when no command provided", async () => {
    const result = await bash.runCommand(null);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error: No command provided");
  });
});
