import clipboardy from "node-clipboardy";
import { extractRelevent } from "./extract-relevant";
import { copy } from "./copy";

jest.mock("node-clipboardy");
jest.mock("./extract-relevant");

describe("copy", () => {
  it("copies a selected completed response", async () => {
    (extractRelevent as jest.Mock).mockResolvedValue("selected");
    const conversation = {
      lastMessage: () => ({ role: "assistant", content: "response" }),
    } as never;
    await copy(conversation);
    expect(clipboardy.writeSync).toHaveBeenCalledWith("selected");
  });

  it("does nothing when no response exists", async () => {
    const conversation = { lastMessage: () => undefined } as never;
    await expect(copy(conversation)).resolves.toBeUndefined();
  });
});
