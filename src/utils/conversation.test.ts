import OpenAI from "openai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Conversation, renderResponseStream } from "./conversation";
import { LiveFilesystem } from "./live-filesystem";

const stream = (events: unknown[]) => ({
  async *[Symbol.asyncIterator]() {
    for (const event of events) yield event;
  },
});

describe("Conversation", () => {
  it("streams text and continues using the previous response ID", async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce(
        stream([
          { type: "response.output_text.delta", delta: "Hello" },
          { type: "response.completed", response: { id: "resp_1" } },
        ])
      )
      .mockResolvedValueOnce(
        stream([
          { type: "response.output_text.delta", delta: "Again" },
          { type: "response.completed", response: { id: "resp_2" } },
        ])
      );
    const client = { responses: { create } } as unknown as OpenAI;
    const renderer = { injest: jest.fn(), flush: jest.fn() };
    const conversation = new Conversation({ apiKey: "test", client, renderer });

    await expect(conversation.talk("First")).resolves.toEqual({
      ok: true,
      content: "Hello",
      responseId: "resp_1",
    });
    await conversation.talk("Second");

    expect(create.mock.calls[0][0]).toMatchObject({
      model: "gpt-5.6-terra",
      input: "First",
      stream: true,
    });
    expect(create.mock.calls[1][0]).toMatchObject({
      previous_response_id: "resp_1",
    });
    expect(conversation.lastMessage()).toEqual({
      role: "assistant",
      content: "Again",
    });
  });

  it("does not expose a response after an API failure and reset clears state", async () => {
    const client = {
      responses: { create: jest.fn().mockRejectedValue(new Error("bad key")) },
    } as unknown as OpenAI;
    const conversation = new Conversation({
      apiKey: "test",
      client,
      renderer: { injest() {}, flush() {} },
    });
    const result = await conversation.talk("Hello");
    expect(result).toEqual({ ok: false, error: expect.any(Error) });
    expect(conversation.hasResponse()).toBe(false);
    conversation.reset();
    expect(conversation.lastMessage()).toBeUndefined();
  });

  it("executes approved filesystem tool calls before continuing the response", async () => {
    const workspace = fs.mkdtempSync(
      path.join(os.tmpdir(), "chatgpt-tui-live-")
    );
    fs.writeFileSync(path.join(workspace, "note.txt"), "live content");
    const create = jest
      .fn()
      .mockResolvedValueOnce(
        stream([
          {
            type: "response.output_item.done",
            item: {
              type: "function_call",
              call_id: "call_1",
              name: "read_file",
              arguments: '{"path":"note.txt"}',
            },
          },
          { type: "response.completed", response: { id: "resp_tool" } },
        ])
      )
      .mockResolvedValueOnce(
        stream([
          { type: "response.output_text.delta", delta: "Found it" },
          { type: "response.completed", response: { id: "resp_final" } },
        ])
      );
    const renderer = { injest: jest.fn(), flush: jest.fn() };
    const conversation = new Conversation({
      apiKey: "test",
      client: { responses: { create } } as unknown as OpenAI,
      renderer,
      filesystem: new LiveFilesystem(workspace),
    });

    try {
      await expect(conversation.talk("Read the note")).resolves.toMatchObject({
        ok: true,
        content: "Found it",
        responseId: "resp_final",
      });
      expect(create.mock.calls[0][0].tools).toEqual(expect.any(Array));
      expect(create.mock.calls[1][0]).toMatchObject({
        previous_response_id: "resp_tool",
        input: [
          {
            type: "function_call_output",
            call_id: "call_1",
            output: "live content",
          },
        ],
      });
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe("renderResponseStream", () => {
  it("rejects incomplete streams", async () => {
    await expect(
      renderResponseStream(
        stream([
          { type: "response.output_text.delta", delta: "partial" },
        ]) as never,
        {
          injest() {},
          flush() {},
        }
      )
    ).rejects.toThrow("ended before completion");
  });
});
