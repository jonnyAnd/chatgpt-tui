import prompts from "prompts";
import { act } from "./act";
import { copy } from "./copy";
import { talk } from "./talk";
import { write } from "./write";

jest.mock("prompts");
jest.mock("./copy");
jest.mock("./talk");
jest.mock("./write");

describe("act", () => {
  const conversation = { reset: jest.fn() } as never;

  afterEach(() => jest.resetAllMocks());

  it("continues in a loop and supports reset", async () => {
    (prompts as jest.Mock)
      .mockResolvedValueOnce({ answer: "r" })
      .mockResolvedValueOnce({ answer: "n" })
      .mockResolvedValueOnce({ answer: "q" });
    (talk as jest.Mock)
      .mockResolvedValueOnce("one.ts")
      .mockResolvedValueOnce(undefined);

    await act(conversation);

    expect(talk).toHaveBeenCalledWith(conversation);
    expect(conversation.reset).toHaveBeenCalledTimes(1);
    expect(talk).toHaveBeenLastCalledWith(conversation, false);
  });

  it("awaits copy and write actions", async () => {
    (prompts as jest.Mock)
      .mockResolvedValueOnce({ answer: "c" })
      .mockResolvedValueOnce({ answer: "w" })
      .mockResolvedValueOnce({ answer: "q" });
    await act(conversation, "hint.ts");
    expect(copy).toHaveBeenCalledWith(conversation);
    expect(write).toHaveBeenCalledWith(conversation, "hint.ts");
  });
});
