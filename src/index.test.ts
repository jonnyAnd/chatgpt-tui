jest.mock("./utils/get-credentials", () => ({
  getCredentials: jest.fn().mockResolvedValue("test-key"),
}));

jest.mock("./parsers", () => ({
  parseUserInput: jest.fn().mockResolvedValue(["parsed message", ["file.ts"]]),
}));

jest.mock("./prompts", () => ({
  talk: jest.fn(),
  act: jest.fn(),
}));

const talk = jest
  .fn()
  .mockResolvedValue({ ok: true, content: "response", responseId: "resp_1" });
jest.mock("./utils/conversation", () => ({
  Conversation: jest.fn().mockImplementation(() => ({
    talk,
    hasResponse: jest.fn(),
  })),
}));

jest.mock("./utils/update", () => ({
  formatUpdateError: jest.fn((error) => String(error)),
  updateInstalledExecutable: jest.fn(),
}));

import { createProgram, main, runCli } from "./index";
import { parseUserInput } from "./parsers";
import { act } from "./prompts";
import { updateInstalledExecutable } from "./utils/update";

describe("main", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    talk.mockResolvedValue({
      ok: true,
      content: "response",
      responseId: "resp_1",
    });
    (updateInstalledExecutable as jest.Mock).mockResolvedValue({
      status: "up-to-date",
      currentVersion: "0.0.0",
      latestVersion: "0.0.0",
    });
  });

  it("streams --user-msg responses without opening the interactive action menu", async () => {
    await main({ userMsg: "message", quiet: true });

    expect(parseUserInput).toHaveBeenCalledWith("message");
    expect(talk).toHaveBeenCalledWith("parsed message");
    expect(act).not.toHaveBeenCalled();
  });

  it("reports an existing installation without trying to install again", async () => {
    const log = jest.spyOn(console, "log").mockImplementation();

    await main({ install: true }, true);

    expect(log).toHaveBeenCalledWith("chatgpt-tui is already installed.");
    log.mockRestore();
  });

  it("only shows install when the application is not installed", () => {
    expect(createProgram(false).helpInformation()).toContain("--install");
    expect(createProgram(false).helpInformation()).not.toContain("--update");
  });

  it("offers a location option and no longer offers outside-workspace access", () => {
    const help = createProgram(false).helpInformation();

    expect(help).toContain("-l, --location <path>");
    expect(help).not.toContain("--allow-outside-workspace");
  });

  it("only shows update when the application is installed", () => {
    expect(createProgram(true).helpInformation()).toContain("--update");
    expect(createProgram(true).helpInformation()).not.toContain("--install");
  });

  it("handles unavailable install and update commands without an error", async () => {
    const log = jest.spyOn(console, "log").mockImplementation();

    await runCli(["node", "chatgpt-tui", "--install"], true);
    await runCli(["node", "chatgpt-tui", "--update"], false);

    expect(log).toHaveBeenNthCalledWith(1, "chatgpt-tui is already installed.");
    expect(log).toHaveBeenNthCalledWith(
      2,
      "chatgpt-tui must be installed before it can be updated."
    );
    log.mockRestore();
  });

  it("checks for updates when the application is installed", async () => {
    const log = jest.spyOn(console, "log").mockImplementation();

    await runCli(["node", "chatgpt-tui", "--update"], true);

    expect(updateInstalledExecutable).toHaveBeenCalledWith(
      expect.objectContaining({ currentVersion: "0.0.0" })
    );
    expect(log).toHaveBeenCalledWith(
      "chatgpt-tui 0.0.0 is already up to date."
    );
    log.mockRestore();
  });
});
