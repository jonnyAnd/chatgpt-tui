import OpenAI from "openai";
import { MarkdownRenderer, Renderer } from "../renderers";
import {
  executeLiveFilesystemTool,
  LiveFilesystem,
  liveFilesystemTools,
} from "./live-filesystem";

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
  filesystem?: LiveFilesystem;
}

type TalkResult =
  | { ok: true; content: string; responseId: string }
  | { ok: false; error: Error };

class Conversation {
  private _openai: OpenAI;
  private _renderer: Renderer;
  model: string;
  systemMsg: string;
  private filesystem?: LiveFilesystem;
  private previousResponseId?: string;
  private latestAssistantMessage?: Message;

  constructor({
    apiKey,
    renderer = new MarkdownRenderer(),
    model = "gpt-5.6-terra",
    systemMsg = defaultSystemMessage,
    client,
    filesystem,
  }: ConversationConstructor) {
    this._openai = client ?? new OpenAI({ apiKey });
    this._renderer = renderer;
    this.model = model;
    this.systemMsg = systemMsg;
    this.filesystem = filesystem;
  }

  async talk(content: string): Promise<TalkResult> {
    try {
      let input: string | OpenAI.Responses.ResponseInput = content;
      let previousResponseId = this.previousResponseId;
      const instructions = this.filesystem
        ? `${this.systemMsg}\n\nThe user granted live access to an approved local workspace for this chat. Use list_directory and read_file when you need to inspect it. You may use apply_patch to create or update a file, but every change is shown to the user and must receive their exact y confirmation before it is written. Do not claim that you lack filesystem access.`
        : this.systemMsg;

      for (let attempts = 0; attempts < 20; attempts += 1) {
        const stream = await this._openai.responses.create({
          model: this.model,
          instructions,
          input,
          previous_response_id: previousResponseId,
          ...(this.filesystem ? { tools: liveFilesystemTools } : {}),
          stream: true,
        });
        const result = await renderResponseStream(stream, this._renderer);
        previousResponseId = result.responseId;

        if (!this.filesystem || !result.toolCalls?.length) {
          this.previousResponseId = result.responseId;
          this.latestAssistantMessage = {
            role: "assistant",
            content: result.content,
          };
          return {
            ok: true,
            content: result.content,
            responseId: result.responseId,
          };
        }

        const toolOutputs: OpenAI.Responses.ResponseInput = [];
        for (const call of result.toolCalls) {
          toolOutputs.push({
            type: "function_call_output" as const,
            call_id: call.callId,
            output: await executeLiveFilesystemTool(this.filesystem!, call),
          });
        }
        input = toolOutputs;
      }

      throw new Error("The model exceeded the filesystem tool-call limit.");
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
): Promise<{
  content: string;
  responseId: string;
  toolCalls?: Array<{ callId: string; name: string; arguments: string }>;
}> {
  let content = "";
  let responseId: string | undefined;
  const toolCalls: Array<{ callId: string; name: string; arguments: string }> =
    [];
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      content += event.delta;
      renderer.injest(event.delta);
    } else if (event.type === "response.completed") {
      responseId = event.response.id;
    } else if (
      event.type === "response.output_item.done" &&
      event.item.type === "function_call"
    ) {
      toolCalls.push({
        callId: event.item.call_id,
        name: event.item.name,
        arguments: event.item.arguments,
      });
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
  return toolCalls.length > 0
    ? { content, responseId, toolCalls }
    : { content, responseId };
}

export { Conversation, defaultSystemMessage, renderResponseStream };
export type { TalkResult };
