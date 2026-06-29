import { describe, expect, test } from "bun:test";
import { toModelMessages } from "./messages.js";
import type { Message } from "./types.js";

describe("toModelMessages", () => {
  test("converts user and assistant text messages", () => {
    const messages: Message[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ];

    expect(toModelMessages(messages)).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
  });

  test("filters system messages", () => {
    const messages: Message[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "hello" },
    ];

    expect(toModelMessages(messages)).toEqual([{ role: "user", content: "hello" }]);
  });

  test("converts assistant tool calls", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: "Reading file",
        toolCalls: [{ id: "tc1", name: "file.read", input: { path: "/tmp/a" } }],
      },
    ];

    expect(toModelMessages(messages)).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Reading file" },
          {
            type: "tool-call",
            toolCallId: "tc1",
            toolName: "file.read",
            input: { path: "/tmp/a" },
          },
        ],
      },
    ]);
  });

  test("converts tool results", () => {
    const messages: Message[] = [
      {
        role: "tool",
        content: "file contents",
        toolCallId: "tc1",
        toolName: "file.read",
      },
    ];

    expect(toModelMessages(messages)).toEqual([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "tc1",
            toolName: "file.read",
            output: { type: "text", value: "file contents" },
          },
        ],
      },
    ]);
  });

  test("skips tool messages without ids", () => {
    const messages: Message[] = [{ role: "tool", content: "orphan" }];
    expect(toModelMessages(messages)).toEqual([]);
  });
});
