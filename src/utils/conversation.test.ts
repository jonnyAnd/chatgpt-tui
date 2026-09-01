import OpenAI from "openai";
import { Conversation, renderResponseStream } from "./conversation";

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
