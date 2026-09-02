#!/usr/bin/env node

import * as util from "util";
import { readFileSync } from "fs";
import { join } from "path";
import { getAsset, isSea } from "node:sea";
import _figlet from "figlet";
import chalk from "chalk";
import { Command } from "commander";
import { talk, act } from "./prompts";
import { parseUserInput } from "./parsers";
import { Conversation } from "./utils/conversation";
import { getCredentials } from "./utils/get-credentials";
import { setConfig } from "./utils/config";
import {
  formatInstallationError,
  installCurrentExecutable,
  isInstalledExecutable,
} from "./utils/install";
import { formatUpdateError, updateInstalledExecutable } from "./utils/update";

declare const __APP_VERSION__: string;

const figlet = util.promisify(_figlet);

function getPackageVersion() {
  const packageFile = join(__dirname, "..", "package.json");
  return (JSON.parse(readFileSync(packageFile, "utf8")) as { version: string })
    .version;
}

const packageVersion = isSea() ? __APP_VERSION__ : getPackageVersion();

function loadSeaFigletFont() {
  if (!isSea()) return;
  _figlet.parseFont("Standard", getAsset("figlet/Standard.flf", "utf8"));
}

type MainOptions = {
  systemMsg?: string;
  userMsg?: string;
  model?: string;
  debug?: boolean;
  quiet?: boolean;
  allowOutsideWorkspace?: boolean;
  install?: boolean;
  update?: boolean;
};

async function main(
  {
    systemMsg,
    userMsg,
    model,
    debug,
    quiet = false,
    allowOutsideWorkspace = false,
    install = false,
    update = false,
  }: MainOptions = {},
  installed = isInstalledExecutable()
) {
  if (install) {
    if (installed) {
      console.log("chatgpt-tui is already installed.");
      return;
    }
    if (!isSea()) {
      throw new Error(
        "Installation must be run from the packaged chatgpt-tui executable."
      );
    }
    try {
      const result = await installCurrentExecutable();
      if (result === "already-installed") {
        console.log("chatgpt-tui is already installed.");
      } else {
        console.log("chatgpt-tui was installed to /usr/local/bin/chatgpt-tui.");
      }
    } catch (error) {
      throw new Error(formatInstallationError(error));
    }
    return;
  }

  if (update) {
    if (!installed) {
      console.log("chatgpt-tui must be installed before it can be updated.");
      return;
    }
    try {
      const result = await updateInstalledExecutable({
        currentVersion: packageVersion,
        onUpdateAvailable: (currentVersion, latestVersion) => {
          console.log(
            `Updating chatgpt-tui from ${currentVersion} to ${latestVersion}.`
          );
        },
      });
      if (result.status === "up-to-date") {
        console.log(
          `chatgpt-tui ${result.currentVersion} is already up to date.`
        );
      }
    } catch (error) {
      throw new Error(formatUpdateError(error));
    }
    return;
  }

  setConfig({ debug: Boolean(debug), allowOutsideWorkspace });
  if (!quiet) {
    loadSeaFigletFont();
    const figletText = await figlet("ChatGPT TUI");
    console.log(chalk.green.bold(figletText));
  }
  const apiKey = await getCredentials();
  const conversation = new Conversation({ apiKey, systemMsg, model });
  if (!userMsg) {
    const fileHint = await talk(conversation, false);
    if (conversation.hasResponse()) await act(conversation, fileHint);
  } else {
    const [parsedMessage] = await parseUserInput(userMsg);
    const result = await conversation.talk(parsedMessage);
    if (!result.ok) {
      throw result.error;
    }
    // A supplied message is the non-interactive CLI path. The response has
    // already streamed to stdout, so do not leave scripts waiting on a menu.
  }
}

function createProgram(installed: boolean): Command {
  const program = new Command();
  program
    .name("chatgpt-tui")
    .version(packageVersion, "-v, --version", "output the release version")
    .option("-s, --system-msg <msg>", "preload a system message string")
    .option("-u, --user-msg <msg>", "preload a user message string")
    .option("-d, --debug", "print out user messages post parsing")
    .option("-q, --quiet", "disable figlet")
    .option(
      "--allow-outside-workspace",
      "allow $FILE and $FOLDER paths outside the current working directory"
    )
    .option(
      "-m, --model <model>",
      "model to use for chat, defaults to gpt-5.6-terra"
    );

  if (installed) {
    program.option("--update", "update chatgpt-tui");
  } else {
    program.option("--install", "install chatgpt-tui to /usr/local/bin");
  }

  return program;
}

function normalizeArguments(args: string[]): string[] {
  return args.map((arg) => (arg === "-install" ? "--install" : arg));
}

function unavailableCommandMessage(args: string[], installed: boolean) {
  if (installed && args.includes("--install")) {
    return "chatgpt-tui is already installed.";
  }
  if (!installed && args.includes("--update")) {
    return "chatgpt-tui must be installed before it can be updated.";
  }
  return undefined;
}

async function runCli(
  args = process.argv,
  installed = isInstalledExecutable()
): Promise<void> {
  const normalizedArgs = normalizeArguments(args);
  const unavailableMessage = unavailableCommandMessage(
    normalizedArgs,
    installed
  );
  if (unavailableMessage) {
    console.log(unavailableMessage);
    return;
  }

  const program = createProgram(installed);
  program.parse(normalizedArgs);
  await main(program.opts(), installed);
}

if (require.main === module) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ChatGPT-TUI failed: ${message}`);
    process.exitCode = 1;
  });
}

export { createProgram, main, runCli };
export type { MainOptions };
