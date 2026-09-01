import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import prompts from "prompts";
import { getCredentials, validateApiKey } from "./get-credentials";

jest.mock("prompts");

describe("credentials", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-tui-test-"));

  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

  it("accepts opaque keys without enforcing an obsolete format", () => {
    expect(validateApiKey("proj-key-with-a-modern-length")).toBe(true);
    expect(validateApiKey(" ")).toBe("API key cannot be empty");
  });

  it("prefers an environment key over legacy storage", async () => {
    const legacy = path.join(directory, ".gpt", "credentials");
    fs.mkdirSync(path.dirname(legacy));
    fs.writeFileSync(legacy, "legacy-key");
    await expect(
      getCredentials({
        homeDirectory: directory,
        env: { OPENAI_API_KEY: " env-key " },
      })
    ).resolves.toBe("env-key");
  });

  it("prompts and stores a restricted legacy fallback when no key exists", async () => {
    const homeDirectory = path.join(directory, "prompted");
    (prompts as jest.Mock).mockResolvedValue({ apiKey: "new-key" });
    await expect(getCredentials({ homeDirectory, env: {} })).resolves.toBe(
      "new-key"
    );
    expect(
      fs.readFileSync(path.join(homeDirectory, ".gpt", "credentials"), "utf8")
    ).toBe("new-key");
  });
});
