import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const installationPath = "/usr/local/bin/chatgpt-tui";

type InstallOptions = {
  sourcePath?: string;
  destinationPath?: string;
};

function isInstalledExecutable(executablePath = process.execPath): boolean {
  return path.resolve(executablePath) === installationPath;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function installCurrentExecutable({
  sourcePath = process.execPath,
  destinationPath = installationPath,
}: InstallOptions = {}): Promise<"installed" | "already-installed"> {
  if (await pathExists(destinationPath)) return "already-installed";

  const temporaryPath = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}-${process.pid}-${randomUUID()}.tmp`
  );
  let copiedTemporaryFile = false;

  try {
    await fs.promises.copyFile(
      sourcePath,
      temporaryPath,
      fs.constants.COPYFILE_EXCL
    );
    copiedTemporaryFile = true;
    await fs.promises.chmod(temporaryPath, 0o755);
    await fs.promises.link(temporaryPath, destinationPath);
    return "installed";
  } catch (error) {
    if (
      copiedTemporaryFile &&
      (error as NodeJS.ErrnoException).code === "EEXIST"
    ) {
      return "already-installed";
    }
    throw error;
  } finally {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function replaceInstalledExecutable(
  sourcePath: string,
  destinationPath = installationPath
): Promise<void> {
  const temporaryPath = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}-${process.pid}-${randomUUID()}.tmp`
  );

  try {
    await fs.promises.copyFile(
      sourcePath,
      temporaryPath,
      fs.constants.COPYFILE_EXCL
    );
    await fs.promises.chmod(temporaryPath, 0o755);
    await fs.promises.rename(temporaryPath, destinationPath);
  } finally {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

function formatInstallationError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EACCES" || code === "EPERM") {
    return `Installation needs permission to write to ${installationPath}. Run chatgpt-tui -install with appropriate privileges.`;
  }

  const message = error instanceof Error ? error.message : String(error);
  return `Could not install chatgpt-tui: ${message}`;
}

export {
  formatInstallationError,
  installCurrentExecutable,
  installationPath,
  isInstalledExecutable,
  replaceInstalledExecutable,
};
export type { InstallOptions };
