import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider, Message, LLMOptions, LLMResult, SyncChatResult } from "./base.js";

export class GeminiProvider implements LLMProvider {
  name = "gemini";
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async chat(messages: Message[], options: LLMOptions): Promise<LLMResult> {
    const model = this.genAI.getGenerativeModel({ model: options.model });
    const systemMsg = messages.find((m) => m.role === "system")?.content;
    const history = messages
      .filter((m) => m.role !== "system")
      .slice(0, -1)
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const lastMsg = messages.filter((m) => m.role !== "system").at(-1);
    const chat = model.startChat({ history, ...(systemMsg ? { systemInstruction: systemMsg } : {}) });
    const res = await chat.sendMessage(lastMsg?.content ?? "");
    return { output: res.response.text() };
  }

  async chatWithTools(messages: Message[], options: LLMOptions): Promise<SyncChatResult> {
    // Gemini tool calling is inconsistent — fall back to plain chat
    const result = await this.chat(messages, options);
    return { content: result.output, toolCalls: [], usage: result.usage };
  }
}
