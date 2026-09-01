import prompts from "prompts";
import { highlight } from "cli-highlight";
import chalk from "chalk";
import { extractCodeBlocks } from "../utils/write-output-to-file";

async function extractRelevent(response: string): Promise<string | undefined> {
  const wantsCodeBlock = await prompts({
    type: "select",
    name: "wantsCodeBlock",
    message: "Do you want the entire output or just the code block?",
    choices: [
      { title: "Entire output", value: "e" },
      { title: "Code block", value: "c" },
    ],
  });
  if (wantsCodeBlock.wantsCodeBlock !== "c") {
    return wantsCodeBlock.wantsCodeBlock === "e" ? response : undefined;
  }

  const codeBlocks = extractCodeBlocks(response);
  if (codeBlocks.length === 0) {
    console.log("No code blocks were found in the response.");
    return undefined;
  }
  if (codeBlocks.length > 1) {
    codeBlocks.forEach((codeBlock, index) => {
      console.log(
        chalk.green.bold(`
******************
** CODE BLOCK ${index} **
******************
`)
      );
      console.log(highlight(codeBlock));
      console.log("");
    });
    const index = await prompts({
      type: "text",
      name: "index",
      message: "Which code block do you want? (Enter a number)",
    });
    const codeBlockIndex = Number.parseInt(index.index, 10);
    const codeBlock = codeBlocks[codeBlockIndex];
    if (!codeBlock) {
      console.log("That code block does not exist.");
      return undefined;
    }
    return codeBlock.trim();
  }
  return codeBlocks[0].trim();
}

export { extractRelevent };
