import OpenAI from "openai";
import { MarkdownRenderer, Renderer } from "../renderers";

interface Message {
  role: "assistant" | "user";
  content: string;
}

const defaultSystemMessage = [
  "You are a helpful assistant whose main job is to write code. ",
  "If you include code blocks in your responses, always include the ",
  "language name after the opening triple backticks. ",
  "For example, ```javascript\nconsole.log('Hello, world!');```",
].join("");

interface ConversationConstructor {
  apiKey: string;
  renderer?: Renderer;
  model?: string;
  systemMsg?: string;
  client?: OpenAI;
}

type TalkResult =
  | { ok: true; content: string; responseId: string }
  | { ok: false; error: Error };

class Conversation {
  private _openai: OpenAI;
  private _renderer: Renderer;
  model: string;
  systemMsg: string;
  private previousResponseId?: string;
  private latestAssistantMessage?: Message;

  constructor({
    apiKey,
    renderer = new MarkdownRenderer(),
    model = "gpt-5.6-terra",
    systemMsg = defaultSystemMessage,
    client,
  }: ConversationConstructor) {
    this._openai = client ?? new OpenAI({ apiKey });
    this._renderer = renderer;
    this.model = model;
    this.systemMsg = systemMsg;
  }

  async talk(content: string): Promise<TalkResult> {
    try {
      const stream = await this._openai.responses.create({
        model: this.model,
        instructions: this.systemMsg,
        input: content,
        previous_response_id: this.previousResponseId,
        stream: true,
      });
      const result = await renderResponseStream(stream, this._renderer);
      this.previousResponseId = result.responseId;
      this.latestAssistantMessage = {
        role: "assistant",
        content: result.content,
      };
      return { ok: true, ...result };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  reset() {
    this.previousResponseId = undefined;
    this.latestAssistantMessage = undefined;
  }

  lastMessage(): Message | undefined {
    return this.latestAssistantMessage;
  }

  hasResponse(): boolean {
    return Boolean(this.latestAssistantMessage);
  }
}

/**
 * Parses the response from OpenAI API as a stream, logs the stream continuously, and returns the result.
 * @param stream - The stream response from OpenAI API
 * @return The parsed result from the stream response
 */
async function renderResponseStream(
  stream: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>,
  renderer: Renderer
): Promise<{ content: string; responseId: string }> {
  let content = "";
  let responseId: string | undefined;
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      content += event.delta;
      renderer.injest(event.delta);
    } else if (event.type === "response.completed") {
      responseId = event.response.id;
    } else if (
      event.type === "response.failed" ||
      event.type === "response.incomplete"
    ) {
      throw new Error(
        event.response.error?.message ?? "The OpenAI response did not complete."
      );
    } else if (event.type === "error") {
      throw new Error(event.message);
    }
  }
  if (!responseId) {
    throw new Error("The OpenAI response stream ended before completion.");
  }
  renderer.flush();
  return { content, responseId };
}

export { Conversation, defaultSystemMessage, renderResponseStream };
export type { TalkResult };
