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
      usage: res.usage
        ? {
            promptTokens: res.usage.prompt_tokens,
            completionTokens: res.usage.completion_tokens,
            totalTokens: res.usage.total_tokens,
          }
        : undefined,
    };
  }

  async chatWithTools(messages: Message[], options: LLMOptions): Promise<SyncChatResult> {
    const params: any = {
      model: options.model,
      messages: messages as any,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    };
    if (options.tools && options.tools.length > 0) {
      params.tools = options.tools;
      params.tool_choice = "auto";
    }

    const res = await this.client.chat.completions.create(params);
    const choice = res.choices[0];
    const message = choice?.message;

    const toolCalls: ToolCallResult[] = [];
    if (message?.tool_calls) {
      for (const tc of message.tool_calls) {
        try {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          });
        } catch {
          // Malformed tool call JSON — treat as final answer
        }
      }
    }

    return {
      content: message?.content ?? "",
      toolCalls,
      usage: res.usage
        ? {
            promptTokens: res.usage.prompt_tokens,
            completionTokens: res.usage.completion_tokens,
            totalTokens: res.usage.total_tokens,
          }
        : undefined,
    };
  }
}
