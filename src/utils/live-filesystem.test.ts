import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { executeLiveFilesystemTool, LiveFilesystem } from "./live-filesystem";

describe("LiveFilesystem", () => {
  let workspace: string;
  let filesystem: LiveFilesystem;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-tui-live-"));
    fs.mkdirSync(path.join(workspace, "nested"));
    fs.writeFileSync(path.join(workspace, "hello.txt"), "hello from disk");
    filesystem = new LiveFilesystem(workspace);
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("lists and reads files inside the approved workspace", () => {
    expect(filesystem.listDirectory()).toBe(
      "file: hello.txt\ndirectory: nested"
    );
    expect(filesystem.readFile("hello.txt")).toBe("hello from disk");
  });

  it("does not follow paths or symlinks outside the approved workspace", () => {
    expect(filesystem.readFile("../outside.txt")).toContain(
      "outside the approved workspace"
    );
    fs.symlinkSync("/etc/hosts", path.join(workspace, "hosts"));
    expect(filesystem.readFile("hosts")).toContain(
      "outside the approved workspace"
    );
  });

  it("only writes a confirmed patch", async () => {
    const confirmPatch = jest.fn().mockResolvedValue(true);
    filesystem = new LiveFilesystem(workspace, { confirmPatch });

    await expect(
      filesystem.applyPatch({
        path: "hello.txt",
        operation: "update",
        patch: "@@ -1 +1 @@\n-hello from disk\n+updated content\n",
      })
    ).resolves.toBe("Applied update to hello.txt.");

    expect(filesystem.readFile("hello.txt")).toBe("updated content\n");
    expect(confirmPatch).toHaveBeenCalledWith(
      expect.objectContaining({ path: path.join(workspace, "hello.txt") })
    );
  });

  it("does not write a declined patch", async () => {
    filesystem = new LiveFilesystem(workspace, {
      confirmPatch: jest.fn().mockResolvedValue(false),
    });

    await expect(
      filesystem.applyPatch({
        path: "hello.txt",
        operation: "update",
        patch: "@@ -1 +1 @@\n-hello from disk\n+updated content\n",
      })
    ).resolves.toContain("declined confirmation");

    expect(filesystem.readFile("hello.txt")).toBe("hello from disk");
  });

  it("returns invalid tool arguments as tool errors", async () => {
    await expect(
      executeLiveFilesystemTool(filesystem, {
        name: "read_file",
        arguments: JSON.stringify({}),
      })
    ).resolves.toBe("Error: path must be a string");
  });
});
