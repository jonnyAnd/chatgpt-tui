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

import { main } from "./index";
import { parseUserInput } from "./parsers";
import { act } from "./prompts";

describe("main", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    talk.mockResolvedValue({
      ok: true,
      content: "response",
      responseId: "resp_1",
    });
  });

  it("streams --user-msg responses without opening the interactive action menu", async () => {
    await main({ userMsg: "message", quiet: true });

    expect(parseUserInput).toHaveBeenCalledWith("message");
    expect(talk).toHaveBeenCalledWith("parsed message");
    expect(act).not.toHaveBeenCalled();
  });
});
