import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  compareSemanticVersions,
  findReleaseAsset,
  latestPublishedRelease,
  parseSemanticVersion,
  releaseAssetName,
  updateInstalledExecutable,
} from "./update";
import type { Release } from "./update";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function binaryResponse(contents: Buffer, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () =>
      contents.buffer.slice(
        contents.byteOffset,
        contents.byteOffset + contents.byteLength
      ),
  } as Response;
}

function release(tagName: string, options: Partial<Release> = {}): Release {
  return {
    draft: false,
    prerelease: false,
    tag_name: tagName,
    assets: [],
    ...options,
  };
}

describe("updates", () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-tui-test-"));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("compares semantic versions rather than version strings", () => {
    const older = parseSemanticVersion("v1.9.0");
    const newer = parseSemanticVersion("v1.10.0");

    expect(older).toBeDefined();
    expect(newer).toBeDefined();
    expect(compareSemanticVersions(newer!, older!)).toBeGreaterThan(0);
  });

  it("filters draft and prerelease releases before selecting the newest version", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        response([
          release("v9.0.0", { draft: true }),
          release("v8.0.0", { prerelease: true }),
          release("v7.0.0-beta.1"),
          release("v1.9.0"),
          release("v1.10.0"),
        ])
      );

    await expect(
      latestPublishedRelease(fetchImpl as typeof fetch, "test-agent")
    ).resolves.toMatchObject({ tag_name: "v1.10.0" });
  });

  it("selects only the Linux x64 release asset", () => {
    const asset = {
      name: releaseAssetName,
      browser_download_url: "https://example.test/chatgpt-tui-linux-x64",
    };

    expect(findReleaseAsset(release("v1.0.0", { assets: [asset] }))).toBe(
      asset
    );
    expect(() => findReleaseAsset(release("v1.0.0"))).toThrow(
      "does not include"
    );
  });

  it("does not download or replace the executable when already up to date", async () => {
    const destinationPath = path.join(directory, "chatgpt-tui");
    fs.writeFileSync(destinationPath, "existing executable");
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(response([release("v1.0.0")]));

    await expect(
      updateInstalledExecutable({
        currentVersion: "1.0.0",
        destinationPath,
        temporaryDirectory: directory,
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).resolves.toMatchObject({ status: "up-to-date" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(destinationPath, "utf8")).toBe(
      "existing executable"
    );
  });

  it("leaves the installed executable untouched when downloading fails", async () => {
    const destinationPath = path.join(directory, "chatgpt-tui");
    fs.writeFileSync(destinationPath, "existing executable");
    const asset = {
      name: releaseAssetName,
      browser_download_url: "https://example.test/chatgpt-tui-linux-x64",
    };
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response([release("v1.1.0", { assets: [asset] })]))
      .mockResolvedValueOnce(binaryResponse(Buffer.alloc(0)));

    await expect(
      updateInstalledExecutable({
        currentVersion: "1.0.0",
        destinationPath,
        temporaryDirectory: directory,
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).rejects.toThrow("empty");
    expect(fs.readFileSync(destinationPath, "utf8")).toBe(
      "existing executable"
    );
    expect(fs.readdirSync(directory)).toEqual(["chatgpt-tui"]);
  });

  it("verifies the download and atomically replaces the installed executable", async () => {
    const destinationPath = path.join(directory, "chatgpt-tui");
    const contents = Buffer.from("new executable");
    const digest = `sha256:${createHash("sha256")
      .update(contents)
      .digest("hex")}`;
    fs.writeFileSync(destinationPath, "existing executable");
    const asset = {
      name: releaseAssetName,
      browser_download_url: "https://example.test/chatgpt-tui-linux-x64",
      digest,
    };
    const available = jest.fn();
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response([release("v1.1.0", { assets: [asset] })]))
      .mockResolvedValueOnce(binaryResponse(contents));

    await expect(
      updateInstalledExecutable({
        currentVersion: "1.0.0",
        destinationPath,
        temporaryDirectory: directory,
        fetchImpl: fetchImpl as typeof fetch,
        onUpdateAvailable: available,
      })
    ).resolves.toMatchObject({ status: "updated", latestVersion: "v1.1.0" });
    expect(available).toHaveBeenCalledWith("1.0.0", "v1.1.0");
    expect(fs.readFileSync(destinationPath, "utf8")).toBe("new executable");
    expect(fs.statSync(destinationPath).mode & 0o111).not.toBe(0);
    expect(fs.readdirSync(directory)).toEqual(["chatgpt-tui"]);
  });

  it("rejects an invalid release checksum without replacing the executable", async () => {
    const destinationPath = path.join(directory, "chatgpt-tui");
    fs.writeFileSync(destinationPath, "existing executable");
    const asset = {
      name: releaseAssetName,
      browser_download_url: "https://example.test/chatgpt-tui-linux-x64",
      digest: `sha256:${"0".repeat(64)}`,
    };
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response([release("v1.1.0", { assets: [asset] })]))
      .mockResolvedValueOnce(binaryResponse(Buffer.from("new executable")));

    await expect(
      updateInstalledExecutable({
        currentVersion: "1.0.0",
        destinationPath,
        temporaryDirectory: directory,
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).rejects.toThrow("checksum");
    expect(fs.readFileSync(destinationPath, "utf8")).toBe(
      "existing executable"
    );
  });
});
