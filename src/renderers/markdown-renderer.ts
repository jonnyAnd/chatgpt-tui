import { Renderer } from "./index";
import { CodeLineRenderer } from "./code-line-renderer";
import { StandardRenderer } from "./standard-renderer";

class MarkdownRenderer implements Renderer {
  private _unrendered = "";
  private _codeLineRenderer: CodeLineRenderer;
  private _standardRenderer: StandardRenderer;
  private _inCodeBlock = false;

  constructor({
    text = "",
    render = (str: string): void => {
      process.stdout.write(str);
    },
  } = {}) {
    this._codeLineRenderer = new CodeLineRenderer({
      render: (str: string) => render(`${str}\n`),
    });
    this._standardRenderer = new StandardRenderer({ render });
    this.injest(text);
  }

  flush() {
    if (this._unrendered) {
      if (this._inCodeBlock) this._codeLineRenderer.injest(this._unrendered);
      else this._standardRenderer.injest(this._unrendered);
      this._unrendered = "";
    }
    this._codeLineRenderer.flush();
    this._standardRenderer.flush();
  }

  injest(input: string) {
    if (!input) return;
    this._unrendered += input;

    while (this._unrendered) {
      if (this._inCodeBlock) {
        if (!this.renderCompletedCodeBlock()) return;
      } else if (!this.renderCompletedOpeningFence()) {
        return;
      }
    }
  }

  private renderCompletedOpeningFence(): boolean {
    const match = /(^|\n)```([^\r\n]*)\r?\n/.exec(this._unrendered);
    if (!match) {
      this.renderSafeText(this._standardRenderer);
      return false;
    }

    const markerStart = (match.index ?? 0) + match[1].length;
    const marker = match[0].slice(match[1].length);
    this._standardRenderer.injest(this._unrendered.slice(0, markerStart));
    this._standardRenderer.injest(marker);

    const language = match[2].trim();
    if (language) this._codeLineRenderer.language = language;
    this._unrendered = this._unrendered.slice(markerStart + marker.length);
    this._inCodeBlock = true;
    return true;
  }

  private renderCompletedCodeBlock(): boolean {
    const match = /(^|\n)```[ \t]*\r?(?:\n|$)/.exec(this._unrendered);
    if (!match) {
      this.renderSafeText(this._codeLineRenderer);
      return false;
    }

    const markerStart = (match.index ?? 0) + match[1].length;
    const marker = match[0].slice(match[1].length);
    this._codeLineRenderer.injest(this._unrendered.slice(0, markerStart));
    this._standardRenderer.injest(marker);
    this._unrendered = this._unrendered.slice(markerStart + marker.length);
    this._inCodeBlock = false;
    return true;
  }

  private renderSafeText(renderer: Renderer) {
    const suffixLength = this.potentialFenceSuffixLength();
    const safeText = this._unrendered.slice(
      0,
      this._unrendered.length - suffixLength
    );
    if (safeText) renderer.injest(safeText);
    this._unrendered = suffixLength
      ? this._unrendered.slice(-suffixLength)
      : "";
  }

  private potentialFenceSuffixLength(): number {
    for (const suffix of ["\n```", "\n``", "\n`", "\n", "``", "`"]) {
      if (this._unrendered.endsWith(suffix)) return suffix.length;
    }
    return 0;
  }
}

export { MarkdownRenderer };
