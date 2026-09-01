import prompts from "prompts";
import { parseUserInput } from "../parsers";
import { talk } from "./talk";

jest.mock("prompts");
jest.mock("../parsers");

describe("talk", () => {
  it("returns without submitting a cancelled prompt", async () => {
    (prompts as jest.Mock).mockResolvedValue({});
    const conversation = { talk: jest.fn() } as never;
    await expect(talk(conversation)).resolves.toBeUndefined();
    expect(conversation.talk).not.toHaveBeenCalled();
  });

  it("returns a file hint after a successful response", async () => {
    (prompts as jest.Mock).mockResolvedValue({ input: "please help" });
    (parseUserInput as jest.Mock).mockResolvedValue(["parsed", ["source.ts"]]);
    const conversation = {
      talk: jest
        .fn()
        .mockResolvedValue({ ok: true, content: "ok", responseId: "resp" }),
    } as never;
    await expect(talk(conversation)).resolves.toBe("source.ts");
  });
});
