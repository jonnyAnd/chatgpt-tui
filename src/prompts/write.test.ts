import * as fs from "fs";
import prompts from "prompts";
import { extractRelevent } from "./extract-relevant";
import { writeOutputToFile } from "../utils/write-output-to-file";
import { write } from "./write";

jest.mock("prompts");
jest.mock("./extract-relevant");
jest.mock("../utils/write-output-to-file");
jest.mock("fs", () => ({ ...jest.requireActual("fs"), existsSync: jest.fn() }));

describe("write", () => {
  afterEach(() => jest.resetAllMocks());

  it("waits for a selected response to be written", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (prompts as jest.Mock).mockResolvedValue({ path: "result.ts" });
    (extractRelevent as jest.Mock).mockResolvedValue("content");
    const conversation = {
      lastMessage: () => ({ role: "assistant", content: "response" }),
    } as never;
    await write(conversation);
    expect(writeOutputToFile).toHaveBeenCalledWith("content", "result.ts");
  });

  it("requires overwrite confirmation", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (prompts as jest.Mock)
      .mockResolvedValueOnce({ path: "result.ts" })
      .mockResolvedValueOnce({ overwrite: false });
    const conversation = {
      lastMessage: () => ({ role: "assistant", content: "response" }),
    } as never;
    await write(conversation);
    expect(writeOutputToFile).not.toHaveBeenCalled();
  });
});
