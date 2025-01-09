import { resolve } from "path";

interface EditAction {
  action: string;
  path: string;
  content?: string;
}

export async function handleEditAction({ action, path, content }: EditAction) {
  try {
    // Resolve path to absolute path
    const absolutePath = resolve(path);
    let result: string;

    switch (action) {
      case "read": {
        const file = Bun.file(absolutePath);
        if (!(await file.exists())) {
          throw new Error("File does not exist");
        }
        result = await file.text();
        break;
      }

      case "write": {
        if (!content) {
          throw new Error("Write action requires content");
        }
        await Bun.write(absolutePath, content);
        result = "File written successfully";
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return {
      content: [
        {
          type: "text",
          text: result,
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
