import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { installationPath } from "./install";

async function updateRequiresPrivileges(
  destinationPath = installationPath
): Promise<boolean> {
  if (process.getuid?.() === 0) return false;

  try {
    await fs.promises.access(path.dirname(destinationPath), fs.constants.W_OK);
    return false;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EACCES" || code === "EPERM" || code === "EROFS";
  }
}

function runUpdateWithSudo(executablePath = process.execPath): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("sudo", [executablePath, "--update"], {
      stdio: "inherit",
    });

    child.once("error", (error) => {
      reject(new Error(`Could not start sudo: ${error.message}`));
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (code === null) {
        reject(
          new Error(
            `Administrator-authorized update was terminated by ${
              signal ?? "a signal"
            }.`
          )
        );
        return;
      }

      reject(
        new Error(`Administrator-authorized update exited with status ${code}.`)
      );
    });
  });
}

export { runUpdateWithSudo, updateRequiresPrivileges };
