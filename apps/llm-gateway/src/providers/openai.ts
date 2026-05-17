import OpenAI from "openai";
import type { LLMProvider, Message, LLMOptions, LLMResult } from "./base.js";

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async chat(messages: Message[], options: LLMOptions): Promise<LLMResult> {
    const res = await this.client.chat.completions.create({
      model: options.model,
      messages,
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
}
