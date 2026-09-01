import prompts from "prompts";
import { Conversation } from "../utils/conversation";

async function act(
  conversation: Conversation,
  fileHint?: string
): Promise<void> {
  const { copy } = await import("./copy");
  const { write } = await import("./write");
  const { talk } = await import("./talk");

  let currentFileHint = fileHint;
  while (true) {
    console.log("\n");
    const input = await prompts({
      type: "select",
      name: "answer",
      message: "What would you like to do next?",
      choices: [
        { title: "💬 Reply", value: "r" },
        { title: "📋 Copy to clipboard", value: "c" },
        { title: "📁 Write to file", value: "w" },
        { title: "🆕 New conversation", value: "n" },
        { title: "👋 Quit", value: "q" },
      ],
    });

    switch (input.answer) {
      case "r": {
        const nextHint = await talk(conversation);
        currentFileHint = nextHint;
        break;
      }
      case "c":
        await copy(conversation);
        break;
      case "w":
        await write(conversation, currentFileHint);
        break;
      case "n":
        conversation.reset();
        currentFileHint = await talk(conversation, false);
        break;
      case "q":
      default:
        console.log("Goodbye!");
        return;
    }
  }
}

export { act };
