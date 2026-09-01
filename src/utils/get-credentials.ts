import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import prompts from "prompts";

export interface CredentialOptions {
  apiKey?: string;
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
}

function credentialPaths(homeDirectory = os.homedir()) {
  const directory = path.join(homeDirectory, ".gpt");
  return { directory, file: path.join(directory, "credentials") };
}

function validateApiKey(apiKey?: string): true | string {
  return apiKey?.trim() ? true : "API key cannot be empty";
}

function readLegacyCredential(file: string): string | undefined {
  if (!fs.existsSync(file)) return undefined;
  const apiKey = fs.readFileSync(file, "utf8").trim();
  return apiKey || undefined;
}

function writeLegacyCredential(
  directory: string,
  file: string,
  apiKey: string
) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, apiKey, { encoding: "utf8", mode: 0o600 });
}

async function getCredentials(
  options: CredentialOptions = {}
): Promise<string> {
  const directKey = options.apiKey?.trim();
  if (directKey) return directKey;

  const environmentKey = (options.env ?? process.env).OPENAI_API_KEY?.trim();
  if (environmentKey) return environmentKey;

  const { directory, file } = credentialPaths(options.homeDirectory);
  const legacyKey = readLegacyCredential(file);
  if (legacyKey) return legacyKey;

  const response = await prompts({
    type: "password",
    name: "apiKey",
    message: "Enter your OpenAI API key:",
    validate: validateApiKey,
  });
  const apiKey =
    typeof response.apiKey === "string" ? response.apiKey.trim() : "";
  if (validateApiKey(apiKey) !== true) {
    throw new Error(
      "No API key was provided. Set OPENAI_API_KEY and try again."
    );
  }

  writeLegacyCredential(directory, file, apiKey);
  return apiKey;
}

export { credentialPaths, getCredentials, validateApiKey };
