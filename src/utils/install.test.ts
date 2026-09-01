import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ensureConfigDirectory,
  formatInstallationError,
  getConfigDirectory,
  installCurrentExecutable,
} from "./install";

describe("installation", () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-tui-test-"));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("uses XDG_CONFIG_HOME when it is available", () => {
    expect(
      getConfigDirectory({ XDG_CONFIG_HOME: "/config", HOME: "/home/user" })
    ).toBe("/config/chatgpt-tui");
  });

  it("uses HOME/.config when XDG_CONFIG_HOME is unavailable", () => {
    expect(getConfigDirectory({ HOME: "/home/user" })).toBe(
      "/home/user/.config/chatgpt-tui"
    );
  });

  it("creates a writable configuration directory", async () => {
    const configHome = path.join(directory, "config");

    await expect(
      ensureConfigDirectory({ XDG_CONFIG_HOME: configHome })
    ).resolves.toBe(path.join(configHome, "chatgpt-tui"));
    expect(
      fs.statSync(path.join(configHome, "chatgpt-tui")).isDirectory()
    ).toBe(true);
    expect(() =>
      fs.accessSync(path.join(configHome, "chatgpt-tui"), fs.constants.W_OK)
    ).not.toThrow();
  });

  it("copies the executable and makes the installed file executable", async () => {
    const sourcePath = path.join(directory, "source");
    const destinationPath = path.join(directory, "bin", "chatgpt-tui");
    fs.mkdirSync(path.dirname(destinationPath));
    fs.writeFileSync(sourcePath, "executable contents", { mode: 0o600 });

    await expect(
      installCurrentExecutable({ sourcePath, destinationPath })
    ).resolves.toBe("installed");
    expect(fs.readFileSync(destinationPath, "utf8")).toBe(
      "executable contents"
    );
    expect(fs.statSync(destinationPath).mode & 0o111).not.toBe(0);
  });

  it("does not overwrite an existing installation", async () => {
    const sourcePath = path.join(directory, "source");
    const destinationPath = path.join(directory, "chatgpt-tui");
    fs.writeFileSync(sourcePath, "new executable");
    fs.writeFileSync(destinationPath, "existing executable");

    await expect(
      installCurrentExecutable({ sourcePath, destinationPath })
    ).resolves.toBe("already-installed");
    expect(fs.readFileSync(destinationPath, "utf8")).toBe(
      "existing executable"
    );
  });

  it("removes its temporary file when copying fails", async () => {
    const destinationPath = path.join(directory, "bin", "chatgpt-tui");
    fs.mkdirSync(path.dirname(destinationPath));

    await expect(
      installCurrentExecutable({
        sourcePath: path.join(directory, "missing-source"),
        destinationPath,
      })
    ).rejects.toThrow();
    expect(fs.readdirSync(path.dirname(destinationPath))).toEqual([]);
  });

  it("explains permission failures without suggesting an in-app sudo prompt", () => {
    expect(formatInstallationError({ code: "EACCES" })).toBe(
      "Installation needs permission to write to /usr/local/bin/chatgpt-tui. Run chatgpt-tui -install with appropriate privileges."
    );
  });
});
