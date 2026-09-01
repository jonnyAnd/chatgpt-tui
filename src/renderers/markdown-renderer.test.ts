import { MarkdownRenderer } from "./markdown-renderer";
import markdownTokens from "./test-data/markdown-tokens";
import markdownTokensOutput from "./test-data/markdown-tokens-output";
import markdownTokens1 from "./test-data/markdown-tokens-1";

describe("MarkdownRenderer", () => {
  const stripAnsi = (value: string) =>
    value.replace(/\u001B\[[0-?]*[ -\/]*[@-~]/g, "");

  it("should correctly render markdown code", () => {
    const log = [];
    const renderer = new MarkdownRenderer({ render: (str) => log.push(str) });
    markdownTokens.forEach((token) => {
      renderer.injest(token);
    });
    renderer.flush();
    expect(stripAnsi(log.join(""))).toBe(stripAnsi(markdownTokensOutput));
  });

  it("should correctly render markdown code that contains markdown code", () => {
    const log = [];
    const renderer = new MarkdownRenderer({ render: (str) => log.push(str) });
    markdownTokens1.forEach((token) => {
      renderer.injest(token);
    });
    renderer.flush();
    expect(log.join("")).toMatchInlineSnapshot(`
      "Here is some stupid code that contains more stupid code:

      \`\`\`javascript
      const foo = '\`\`\`javascript\\nconsole.log("foo");\\n\`\`\`';
      \`\`\`
      "
    `);
  });

  it("recognizes a code fence at the start and a closing fence at end of input", () => {
    const log: string[] = [];
    const renderer = new MarkdownRenderer({ render: (str) => log.push(str) });
    ["```javascript\n", "const answer = 42;\n", "```\n", "Done."].forEach(
      (token) => {
        renderer.injest(token);
      }
    );
    renderer.flush();

    expect(stripAnsi(log.join(""))).toBe(
      "```javascript\nconst answer = 42;\n```\nDone."
    );
  });
});
