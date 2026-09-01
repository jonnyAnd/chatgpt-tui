import { LineRenderer } from "./line-renderer";
import { Renderer } from "./index";

import { highlight } from "cli-highlight";

function isOnlyLetters(str: string): boolean {
  return /^[a-zA-Z]+$/.test(str);
}

class CodeLineRenderer implements Renderer {
  private _render: (output: string) => void;
  private _lineRenderer: LineRenderer;

  constructor({
    text = "",
    language = "",
    render = (str: string): void => console.log(str),
  } = {}) {
    this._lineRenderer = new LineRenderer({
      text,
      render: (line: string) => render(highlight(line, { language })),
    });
    this._render = render;
  }

  set language(value: string) {
    let language: string | undefined = value;
    if (!isOnlyLetters(language)) {
      console.error("Language must be only letters, got", language);
      language = undefined;
    }

    this._lineRenderer = new LineRenderer({
      render: (line: string) => this._render(highlight(line, { language })),
    });
  }

  injest(input: string) {
    this._lineRenderer.injest(input);
  }

  flush() {
    this._lineRenderer.flush();
  }
}

export { CodeLineRenderer };
