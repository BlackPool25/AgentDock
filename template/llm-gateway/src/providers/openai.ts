import OpenAI from "openai";
import type { LLMProvider, Message, LLMOptions, LLMResult, SyncChatResult, ToolCallResult } from "./base.js";

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async chat(messages: Message[], options: LLMOptions): Promise<LLMResult> {
    const res = await this.client.chat.completions.create({
      model: options.model,
      messages: messages as any,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    });
    const choice = res.choices[0];
    return {
      output: choice?.message?.content ?? "",
      usage: res.usage ? {
        promptTokens: res.usage.prompt_tokens,
        completionTokens: res.usage.completion_tokens,
        totalTokens: res.usage.total_tokens,
      } : undefined,
    };
  }

  async chatWithTools(messages: Message[], options: LLMOptions): Promise<SyncChatResult> {
    const params: any = {
      model: options.model,
      messages: messages as any,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    };
    if (options.tools?.length) {
      params.tools = options.tools;
      params.tool_choice = "auto";
    }
    const res = await this.client.chat.completions.create(params);
    const msg = res.choices[0]?.message;
    const toolCalls: ToolCallResult[] = [];
    for (const tc of msg?.tool_calls ?? []) {
      try {
        toolCalls.push({ id: tc.id, name: tc.function.name, arguments: JSON.parse(tc.function.arguments) });
      } catch { /* malformed tool call — skip, treat as final answer */ }
    }
    return {
      content: msg?.content ?? "",
      toolCalls,
      usage: res.usage ? {
        promptTokens: res.usage.prompt_tokens,
        completionTokens: res.usage.completion_tokens,
        totalTokens: res.usage.total_tokens,
      } : undefined,
    };
  }
}
