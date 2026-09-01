import prompts from "prompts";
import * as fs from "fs";
import { writeOutputToFile } from "../utils/write-output-to-file";
import { extractRelevent } from "./extract-relevant";
import { Conversation } from "../utils";

async function write(
  conversation: Conversation,
  fileHint?: string
): Promise<void> {
  const message = conversation.lastMessage();
  if (!message) {
    console.log("There is no completed response to write.");
    return;
  }

  const path = await prompts({
    type: "text",
    name: "path",
    message: "Enter a file path (hit esc to go back): ",
    initial: fileHint,
  });

  if (!path.path) {
    return;
  }

  if (fs.existsSync(path.path)) {
    const confirmation = await prompts({
      type: "confirm",
      name: "overwrite",
      message: `Overwrite existing file ${path.path}?`,
      initial: false,
    });
    if (!confirmation.overwrite) return;
  }

  const relevent = await extractRelevent(message.content);
  if (relevent === undefined) return;
  await writeOutputToFile(relevent, path.path);
  console.log("Output written to file!");
}

export { write };
