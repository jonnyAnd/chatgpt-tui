import * as fs from "fs";

/**
 * @param str A string representing a markdown-style document with code blocks.
 * @returns An array of objects, each containing a code block, the language of the code block, and the filename of the code block.
 *
 * @example
 * const str = `
 * # Blah blah blah...
 *
 * This is a code block:
 * ```js
 * console.log("This is a code block");
 * ```
 *
 * This is another code block:
 * ```ts
 * console.log("This is another code block");
 * ```
 *
 * blah blah blah...
 * `;
 *
 * extractCodeBlocks(str);
 * // [
 * //   'console.log("This is a code block");',
 * //   'console.log("This is another code block");',
 * // ]
 */
function extractCodeBlocks(str: string): string[] {
  const regexp =
    /(?:^|\r?\n)```[^\r\n]*\r?\n([\s\S]*?)(?:\r?\n```(?=\r?\n|$)|```$)/g;
  return [...str.matchAll(regexp)].map((match) => match[1]);
}

/**
 * Writes the output to a file selected by the user.
 * @param output - The output to write to a file.
 * @param filename - The name of the file to write to.
 */
async function writeOutputToFile(
  output: string,
  filename: string
): Promise<void> {
  const temporaryFile = `${filename}.chatgpt-tui-${
    process.pid
  }-${Date.now()}.tmp`;
  try {
    await fs.promises.writeFile(temporaryFile, output, "utf8");
    await fs.promises.rename(temporaryFile, filename);
    console.log(`Written to file: ${filename}`);
  } catch (error) {
    await fs.promises.rm(temporaryFile, { force: true }).catch(() => undefined);
    throw error;
  }
}

export { writeOutputToFile, extractCodeBlocks };
