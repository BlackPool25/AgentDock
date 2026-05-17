import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, Message, LLMOptions, LLMResult } from "./base.js";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(messages: Message[], options: LLMOptions): Promise<LLMResult> {
    const system = messages.find((m) => m.role === "system")?.content;
    const userMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const res = await this.client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      ...(system ? { system } : {}),
      messages: userMessages,
    });

    const text = res.content.find((b) => b.type === "text");
    return {
      output: text?.type === "text" ? text.text : "",
      usage: {
        promptTokens: res.usage.input_tokens,
        completionTokens: res.usage.output_tokens,
        totalTokens: res.usage.input_tokens + res.usage.output_tokens,
      },
    };
  }
}
