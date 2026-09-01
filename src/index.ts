import * as util from "util";
import { getAsset, isSea } from "node:sea";
import _figlet from "figlet";
import chalk from "chalk";
import { program } from "commander";
import { talk, act } from "./prompts";
import { parseUserInput } from "./parsers";
import { Conversation } from "./utils/conversation";
import { getCredentials } from "./utils/get-credentials";
import { setConfig } from "./utils/config";

const figlet = util.promisify(_figlet);

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
};

async function main({
  systemMsg,
  userMsg,
  model,
  debug,
  quiet = false,
  allowOutsideWorkspace = false,
}: MainOptions = {}) {
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

if (require.main === module) {
  program
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

  program.parse();

  main(program.opts()).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ChatGPT-TUI failed: ${message}`);
    process.exitCode = 1;
  });
}

export { main };
export type { MainOptions };
