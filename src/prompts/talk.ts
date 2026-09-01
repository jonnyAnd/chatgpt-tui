import prompts from "prompts";
import { Conversation } from "../utils/conversation";
import { parseUserInput } from "../parsers";

async function talk(
  conversation: Conversation,
  canGoBack = true
): Promise<string | undefined> {
  console.log("");
  const input = await prompts({
    type: "text",
    name: "input",
    message: `✍️  Enter a message${canGoBack ? " (hit esc to go back)" : ""}: `,
  });

  if (!input.input) {
    return undefined;
  }

  console.log("");
  const [parsedInput, metadata] = await parseUserInput(input.input);
  const firstFile = metadata[0];
  const result = await conversation.talk(parsedInput);
  if (!result.ok) {
    console.error(`OpenAI request failed: ${result.error.message}`);
    return undefined;
  }
  return firstFile;
}

export { talk };
