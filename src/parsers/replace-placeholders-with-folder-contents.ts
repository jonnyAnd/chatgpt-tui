import * as fs from "fs";
import * as path from "path";
import { getConfig } from "../utils/config";

function isWithinRoot(folderPath: string, root: string): boolean {
  const relative = path.relative(root, folderPath);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== "..")
  );
}

/*
 * Replaces $FOLDER(<folder path>) with the contents of all files in the folder.
 * @param str - The string to parse.
 * @return The parsed string with folder contents replaced.
 */
function replacePlaceholdersWithFolderContents(
  str: string
): [string, string[]] {
  const matches = str.match(/\$FOLDER\((.*?)\)/g);
  if (!matches) {
    return [str, []];
  }

  const folderNames = [];
  for (const match of matches) {
    const folderName = match.slice("$FOLDER(".length, -1);
    try {
      const config = getConfig();
      const requestedPath = path.resolve(config.workspaceRoot, folderName);
      const folderPath = fs.realpathSync(requestedPath);
      if (!isWithinRoot(folderPath, config.workspaceRoot)) {
        throw new Error(
          "Folder is outside the current workspace. Use --location to select its workspace."
        );
      }
      const files = fs
        .readdirSync(folderPath, { withFileTypes: true })
        .filter((entry) => entry.isFile() && path.extname(entry.name) !== "")
        .sort((left, right) => left.name.localeCompare(right.name));
      if (files.length > config.maxFolderFiles) {
        throw new Error(
          `Folder exceeds the ${config.maxFolderFiles}-file import limit`
        );
      }
      const fileContents = files
        .map((entry) => {
          const filePath = path.join(folderPath, entry.name);
          if (fs.statSync(filePath).size > config.maxImportBytes) {
            throw new Error(
              `${entry.name} exceeds the ${config.maxImportBytes}-byte import limit`
            );
          }
          const fileContent = fs.readFileSync(filePath, "utf8");
          return `\n\n${path.relative(
            config.workspaceRoot,
            filePath
          )}\n\n${fileContent}`;
        })
        .join("\n\n");
      str = str.replace(match, fileContents);
      folderNames.push(folderName);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Could not replace ${match}: ${message}`);
    }
  }

  return [str, folderNames];
}

export { replacePlaceholdersWithFolderContents };
