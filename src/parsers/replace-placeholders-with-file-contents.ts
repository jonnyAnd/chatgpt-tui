import * as fs from "fs";
import * as path from "path";
import { getConfig } from "../utils/config";

function isWithinRoot(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== "..")
  );
}

function assertReadableFile(fileName: string): string {
  const config = getConfig();
  const requestedPath = path.resolve(config.workspaceRoot, fileName);
  const resolvedPath = fs.realpathSync(requestedPath);
  if (!isWithinRoot(resolvedPath, config.workspaceRoot)) {
    throw new Error(
      "File is outside the current workspace. Use --location to select its workspace."
    );
  }
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) throw new Error("Path is not a regular file");
  if (stat.size > config.maxImportBytes) {
    throw new Error(
      `File exceeds the ${config.maxImportBytes}-byte import limit`
    );
  }
  return resolvedPath;
}

/**
 * Replaces $FILE(<file name>[start_line:end_line]) with the contents of the file.
 * @param str - The string to parse.
 * @return The parsed string with file contents replaced.
 */
function replacePlaceholdersWithFileContents(str: string): [string, string[]] {
  const matches = str.match(/\$FILE\((.*?)\)/g);
  if (!matches) {
    return [str, []];
  }

  const fileNames = [];
  for (const match of matches) {
    const [fileName, range] = match.slice("$FILE(".length, -1).split("[");
    let startLine = 1;
    let endLine = Infinity;

    if (range) {
      [startLine, endLine] = range
        .slice(0, -1)
        .split(":")
        .map((n) => parseInt(n));
    }

    try {
      const filePath = assertReadableFile(fileName);
      const fileContent = fs.readFileSync(filePath, "utf8");
      const fileLines = fileContent.split("\n");
      const requestedContent = fileLines
        .slice(startLine - 1, endLine)
        .join("\n");

      str = str.replace(match, requestedContent);
      fileNames.push(fileName);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Could not replace ${match}: ${message}`);
    }
  }

  return [str, fileNames];
}

export { replacePlaceholdersWithFileContents };
