import clipboardy from "node-clipboardy";
import { extractRelevent } from "./extract-relevant";
import { Conversation } from "../utils";

async function copy(conversation: Conversation): Promise<void> {
  const message = conversation.lastMessage();
  if (!message) {
    console.log("There is no completed response to copy.");
    return;
  }
  const relevent = await extractRelevent(message.content);
  if (relevent === undefined) return;
  clipboardy.writeSync(relevent);
  console.log("Copied to clipboard!");
}

export { copy };
