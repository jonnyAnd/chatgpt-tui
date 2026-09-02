import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";
import prompts from "prompts";

const MAX_FILE_BYTES = 500_000;
const MAX_DIRECTORY_ENTRIES = 1_000;

function isWithinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== "..")
  );
}

class LiveFilesystem {
  readonly root: string;
  private confirmPatch: ConfirmPatch;

  constructor(
    root: string,
    { confirmPatch = confirmPatchWithUser }: LiveFilesystemOptions = {}
  ) {
    this.root = fs.realpathSync(root);
    this.confirmPatch = confirmPatch;
  }

  listDirectory(requestedPath = "."): string {
    try {
      const directory = this.resolvePath(requestedPath);
      if (!fs.statSync(directory).isDirectory()) {
        throw new Error("Path is not a directory");
      }
      const entries = fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
      const visibleEntries = entries
        .slice(0, MAX_DIRECTORY_ENTRIES)
        .map((entry) => {
          const kind = entry.isDirectory()
            ? "directory"
            : entry.isFile()
            ? "file"
            : "other";
          return `${kind}: ${entry.name}`;
        });
      const truncation =
        entries.length > MAX_DIRECTORY_ENTRIES
          ? `\nDirectory listing truncated at ${MAX_DIRECTORY_ENTRIES} entries.`
          : "";
      return visibleEntries.length > 0
        ? visibleEntries.join("\n") + truncation
        : "Directory is empty.";
    } catch (error) {
      return `Error: ${toMessage(error)}`;
    }
  }

  readFile(requestedPath: string): string {
    try {
      const file = this.resolvePath(requestedPath);
      const stat = fs.statSync(file);
      if (!stat.isFile()) throw new Error("Path is not a regular file");
      if (stat.size > MAX_FILE_BYTES) {
        throw new Error(`File exceeds the ${MAX_FILE_BYTES}-byte read limit`);
      }
      return fs.readFileSync(file, "utf8");
    } catch (error) {
      return `Error: ${toMessage(error)}`;
    }
  }

  async applyPatch(change: PatchChange): Promise<string> {
    try {
      const file = this.resolveWritablePath(change.path, change.operation);
      const currentContent =
        change.operation === "update" ? this.readTextFileForPatch(file) : "";
      const nextContent = applyUnifiedDiff(currentContent, change.patch);
      if (nextContent === currentContent) return "No changes were needed.";
      if (Buffer.byteLength(nextContent, "utf8") > MAX_FILE_BYTES) {
        throw new Error(
          `Patched file exceeds the ${MAX_FILE_BYTES}-byte write limit`
        );
      }

      const approved = await this.confirmPatch({
        path: file,
        patch: change.patch,
        operation: change.operation,
      });
      if (!approved) {
        return "Change was not applied because the user declined confirmation.";
      }

      writeFileAtomically(file, nextContent);
      return `Applied ${change.operation} to ${path.relative(
        this.root,
        file
      )}.`;
    } catch (error) {
      return `Error: ${toMessage(error)}`;
    }
  }

  private resolvePath(requestedPath: string): string {
    if (typeof requestedPath !== "string" || requestedPath.length === 0) {
      throw new Error("Path must be a non-empty string");
    }
    const requested = path.resolve(this.root, requestedPath);
    if (!isWithinRoot(requested, this.root)) {
      throw new Error("Path is outside the approved workspace");
    }
    const resolved = fs.realpathSync(requested);
    if (!isWithinRoot(resolved, this.root)) {
      throw new Error("Path is outside the approved workspace");
    }
    return resolved;
  }

  private resolveWritablePath(
    requestedPath: string,
    operation: PatchChange["operation"]
  ): string {
    if (typeof requestedPath !== "string" || requestedPath.length === 0) {
      throw new Error("Path must be a non-empty string");
    }
    const requested = path.resolve(this.root, requestedPath);
    if (!isWithinRoot(requested, this.root)) {
      throw new Error("Path is outside the approved workspace");
    }
    if (operation === "update") {
      if (!fs.existsSync(requested)) throw new Error("File does not exist");
      const resolved = fs.realpathSync(requested);
      if (!isWithinRoot(resolved, this.root)) {
        throw new Error("Path is outside the approved workspace");
      }
      if (!fs.statSync(resolved).isFile()) {
        throw new Error("Path is not a regular file");
      }
      return resolved;
    }
    if (fs.existsSync(requested)) throw new Error("File already exists");
    const parent = fs.realpathSync(path.dirname(requested));
    if (!isWithinRoot(parent, this.root)) {
      throw new Error("Path is outside the approved workspace");
    }
    return requested;
  }

  private readTextFileForPatch(file: string): string {
    const stat = fs.statSync(file);
    if (stat.size > MAX_FILE_BYTES) {
      throw new Error(`File exceeds the ${MAX_FILE_BYTES}-byte read limit`);
    }
    const content = fs.readFileSync(file, "utf8");
    if (content.includes("\0"))
      throw new Error("Binary files cannot be patched");
    return content;
  }
}

type PatchChange = {
  path: string;
  patch: string;
  operation: "create" | "update";
};

type PatchConfirmation = {
  path: string;
  patch: string;
  operation: PatchChange["operation"];
};

type ConfirmPatch = (confirmation: PatchConfirmation) => Promise<boolean>;

type LiveFilesystemOptions = {
  confirmPatch?: ConfirmPatch;
};

async function confirmPatchWithUser({
  path: file,
  patch,
}: PatchConfirmation): Promise<boolean> {
  console.log(`\nProposed change to ${file}:\n\n${patch}\n`);
  const response = await prompts({
    type: "text",
    name: "answer",
    message: "Apply this change? (y/n)",
  });
  return response.answer === "y";
}

function applyUnifiedDiff(content: string, patch: string): string {
  const original = splitLines(content);
  const result: string[] = [];
  const patchLines = patch.replace(/\r\n/g, "\n").split("\n");
  let lineIndex = 0;
  let sourceIndex = 0;
  let hunkCount = 0;

  while (lineIndex < patchLines.length) {
    const line = patchLines[lineIndex];
    if (line.startsWith("--- ") || line.startsWith("+++ ") || line === "") {
      lineIndex += 1;
      continue;
    }
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!header) throw new Error("Patch must contain valid unified-diff hunks");
    const oldStart = Number(header[1]);
    const oldLineCount = Number(header[2] ?? "1");
    const newLineCount = Number(header[4] ?? "1");
    const hunkSourceIndex = oldStart === 0 ? 0 : oldStart - 1;
    if (hunkSourceIndex < sourceIndex || hunkSourceIndex > original.length) {
      throw new Error("Patch hunks are out of order or outside the file");
    }
    result.push(...original.slice(sourceIndex, hunkSourceIndex));
    sourceIndex = hunkSourceIndex;
    lineIndex += 1;
    hunkCount += 1;
    let consumedLines = 0;
    let producedLines = 0;

    while (
      lineIndex < patchLines.length &&
      !patchLines[lineIndex].startsWith("@@ ")
    ) {
      const hunkLine = patchLines[lineIndex];
      if (hunkLine === "" && lineIndex === patchLines.length - 1) {
        lineIndex += 1;
        break;
      }
      if (hunkLine === "\\ No newline at end of file") {
        lineIndex += 1;
        continue;
      }
      const marker = hunkLine[0];
      const text = hunkLine.slice(1);
      if (marker === " ") {
        assertPatchLine(original, sourceIndex, text);
        result.push(text);
        sourceIndex += 1;
        consumedLines += 1;
        producedLines += 1;
      } else if (marker === "-") {
        assertPatchLine(original, sourceIndex, text);
        sourceIndex += 1;
        consumedLines += 1;
      } else if (marker === "+") {
        result.push(text);
        producedLines += 1;
      } else {
        throw new Error("Patch contains an invalid hunk line");
      }
      lineIndex += 1;
    }
    if (consumedLines !== oldLineCount || producedLines !== newLineCount) {
      throw new Error("Patch hunk line counts do not match its header");
    }
  }

  if (hunkCount === 0) throw new Error("Patch must contain at least one hunk");
  result.push(...original.slice(sourceIndex));
  return (
    result.join("\n") +
    (content.endsWith("\n") || patchAddsFinalLine(patch) ? "\n" : "")
  );
}

function splitLines(content: string): string[] {
  if (content === "") return [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (content.endsWith("\n")) lines.pop();
  return lines;
}

function assertPatchLine(
  lines: string[],
  index: number,
  expected: string
): void {
  if (lines[index] !== expected) {
    throw new Error("Patch does not match the current file contents");
  }
}

function patchAddsFinalLine(patch: string): boolean {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  return (
    lines.some((line) => line.startsWith("+")) &&
    !lines.includes("\\ No newline at end of file")
  );
}

function writeFileAtomically(file: string, content: string): void {
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`
  );
  try {
    fs.writeFileSync(temporary, content, { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

const liveFilesystemTools: Array<OpenAI.Responses.FunctionTool> = [
  {
    type: "function",
    name: "list_directory",
    description:
      "List files and subdirectories in an approved local workspace directory. Paths are relative to the approved workspace.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Directory path relative to the approved workspace. Defaults to '.'.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "read_file",
    description:
      "Read a UTF-8 text file from the approved local workspace. Paths are relative to the approved workspace.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to the approved workspace.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "apply_patch",
    description:
      "Create or update one UTF-8 text file in the approved workspace by applying a unified diff. The user is shown the full path and patch and must confirm each change. Deleting files is not supported.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to the approved workspace.",
        },
        operation: {
          type: "string",
          enum: ["create", "update"],
          description:
            "Use create only for a new file, update only for an existing file.",
        },
        patch: {
          type: "string",
          description:
            "A unified diff containing one or more @@ hunk headers for this file.",
        },
      },
      required: ["path", "operation", "patch"],
      additionalProperties: false,
    },
  },
];

type LiveFilesystemToolCall = {
  name: string;
  arguments: string;
};

async function executeLiveFilesystemTool(
  filesystem: LiveFilesystem,
  call: LiveFilesystemToolCall
): Promise<string> {
  try {
    const args = JSON.parse(call.arguments) as {
      path?: unknown;
      patch?: unknown;
      operation?: unknown;
    };
    if (call.name === "list_directory") {
      if (args.path !== undefined && typeof args.path !== "string") {
        return "Error: path must be a string";
      }
      return filesystem.listDirectory(args.path);
    }
    if (call.name === "read_file") {
      if (typeof args.path !== "string") return "Error: path must be a string";
      return filesystem.readFile(args.path);
    }
    if (call.name === "apply_patch") {
      if (typeof args.path !== "string") return "Error: path must be a string";
      if (typeof args.patch !== "string")
        return "Error: patch must be a string";
      if (args.operation !== "create" && args.operation !== "update") {
        return "Error: operation must be create or update";
      }
      return filesystem.applyPatch({
        path: args.path,
        patch: args.patch,
        operation: args.operation,
      });
    }
    return "Error: unknown filesystem tool";
  } catch (error) {
    return `Error: invalid tool arguments: ${toMessage(error)}`;
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { executeLiveFilesystemTool, LiveFilesystem, liveFilesystemTools };
export type { LiveFilesystemToolCall, PatchChange };
