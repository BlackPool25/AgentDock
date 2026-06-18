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
    const functionDeclarations = options.tools
      ?.filter((t: any) => t.type === "function")
      .map((t: any) => ({
        name: t.function.name,
        description: t.function.description ?? "",
        parameters: t.function.parameters,
      })) ?? [];

    const modelOptions: any = { model: options.model };
    if (functionDeclarations.length > 0) {
      modelOptions.tools = [{ functionDeclarations }];
    }
    const model = this.genAI.getGenerativeModel(modelOptions);

    const systemMsg = messages.find((m) => m.role === "system")?.content;

    // Find names of tools matching tool_call_id to map functionResponse names correctly
    const toolCallNames = new Map<string, string>();
    for (const m of messages) {
      if (m.role === "assistant" && (m as any).tool_calls?.length) {
        for (const tc of (m as any).tool_calls) {
          const id = tc.id || (tc as any).tool_call_id;
          if (id) {
            toolCallNames.set(id, tc.function?.name || tc.name);
          }
        }
      }
    }

    const history: any[] = [];
    const filtered = messages.filter((m) => m.role !== "system");

    for (let i = 0; i < filtered.length - 1; i++) {
      const m = filtered[i]!;
      const parts: any[] = [];
      if (m.content) {
        parts.push({ text: m.content });
      }

      if (m.role === "assistant" && (m as any).tool_calls?.length) {
        for (const tc of (m as any).tool_calls) {
          parts.push({
            functionCall: {
              name: tc.function?.name || tc.name,
              args: typeof tc.function?.arguments === "string"
                ? JSON.parse(tc.function.arguments)
                : (tc.function?.arguments || tc.arguments || {}),
            },
          });
        }
        history.push({ role: "model", parts });
      } else if (m.role === "tool") {
        const name = (m as any).name || toolCallNames.get((m as any).tool_call_id) || "tool_function";
        parts.push({
          functionResponse: {
            name,
            response: { result: m.content },
          },
        });
        history.push({ role: "user", parts });
      } else {
        history.push({ role: m.role === "assistant" ? "model" : "user", parts });
      }
    }

    const lastMsg = filtered.at(-1);
    const lastParts: any[] = [];
    if (lastMsg) {
      if (lastMsg.role === "tool") {
        const name = (lastMsg as any).name || toolCallNames.get((lastMsg as any).tool_call_id) || "tool_function";
        lastParts.push({
          functionResponse: {
            name,
            response: { result: lastMsg.content },
          },
        });
      } else {
        lastParts.push({ text: lastMsg.content });
      }
    }

    const chat = model.startChat({
      history,
      ...(systemMsg ? { systemInstruction: systemMsg } : {}),
    });

    const sendContent = lastMsg?.role === "tool" ? lastParts : (lastMsg?.content ?? "");
    const res = await chat.sendMessage(sendContent);

    const calls = res.response.functionCalls();
    const toolCalls: any[] = [];
    if (calls) {
      for (const call of calls) {
        toolCalls.push({
          id: `call_${Math.random().toString(36).substring(2, 11)}`,
          name: call.name,
          arguments: call.args,
        });
      }
    }

    let content = "";
    try {
      content = res.response.text();
    } catch {
      // Catch error when the response only contains function calls
    }

    return {
      content,
      toolCalls,
    };
  }
}
