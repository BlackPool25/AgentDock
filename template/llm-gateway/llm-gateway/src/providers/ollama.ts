import { OpenAIProvider } from "./openai.js";
import type { LLMOptions, LLMResult, SyncChatResult, Message } from "./base.js";
import { OllamaLoadBalancer } from "../loadbalancer/ollama-lb.js";

export class OllamaProvider extends OpenAIProvider {
  private lb: OllamaLoadBalancer;

  constructor(lb: OllamaLoadBalancer) {
    super("ollama", ""); // baseURL set per-request
    this.name = "ollama";
    this.lb = lb;
  }

  private _getProvider(): OpenAIProvider {
    const serverUrl = this.lb.pick();
    if (!serverUrl) throw new Error("No healthy Ollama servers available");
    return new OpenAIProvider("ollama", `${serverUrl}/v1`);
  }

  async chat(messages: Message[], options: LLMOptions): Promise<LLMResult> {
    const serverUrl = this.lb.pick();
    if (!serverUrl) throw new Error("No healthy Ollama servers available");
    this.lb.incrementInFlight(serverUrl);
    try {
      const p = new OpenAIProvider("ollama", `${serverUrl}/v1`);
      return await p.chat(messages, options);
    } finally {
      this.lb.decrementInFlight(serverUrl);
    }
  }

  async chatWithTools(messages: Message[], options: LLMOptions): Promise<SyncChatResult> {
    const serverUrl = this.lb.pick();
    if (!serverUrl) throw new Error("No healthy Ollama servers available");
    this.lb.incrementInFlight(serverUrl);
    try {
      const p = new OpenAIProvider("ollama", `${serverUrl}/v1`);
      return await p.chatWithTools(messages, options);
    } finally {
      this.lb.decrementInFlight(serverUrl);
    }
  }
}
