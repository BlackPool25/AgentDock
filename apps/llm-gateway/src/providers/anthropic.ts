import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, Message, LLMOptions, LLMResult, SyncChatResult } from "./base.js";

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

  async chatWithTools(messages: Message[], options: LLMOptions): Promise<SyncChatResult> {
    const system = messages.find((m) => m.role === "system")?.content;
    const userMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const params: any = {
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      ...(system ? { system } : {}),
      messages: userMessages,
    };
    if (options.tools?.length) {
      params.tools = (options.tools as any[]).map((t: any) => ({
        name: t.function?.name ?? t.name,
        description: t.function?.description ?? "",
        input_schema: t.function?.parameters ?? { type: "object", properties: {} },
      }));
    }
    const res = await this.client.messages.create(params);
    const textBlock = res.content.find((b) => b.type === "text");
    const toolUse = res.content.filter((b) => b.type === "tool_use");
    return {
      content: textBlock?.type === "text" ? textBlock.text : "",
      toolCalls: toolUse.map((b: any) => ({ id: b.id, name: b.name, arguments: b.input ?? {} })),
      usage: {
        promptTokens: res.usage.input_tokens,
        completionTokens: res.usage.output_tokens,
        totalTokens: res.usage.input_tokens + res.usage.output_tokens,
      },
    };
  }
}
