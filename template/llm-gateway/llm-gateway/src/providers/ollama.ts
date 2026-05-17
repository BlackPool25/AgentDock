import { OpenAIProvider } from "./openai.js";
import type { LLMOptions, LLMResult, Message } from "./base.js";
import { OllamaLoadBalancer } from "../loadbalancer/ollama-lb.js";

export class OllamaProvider extends OpenAIProvider {
  private lb: OllamaLoadBalancer;

  constructor(lb: OllamaLoadBalancer) {
    super("ollama", ""); // baseURL set per-request
    this.name = "ollama";
    this.lb = lb;
  }

  async chat(messages: Message[], options: LLMOptions): Promise<LLMResult> {
    const serverUrl = this.lb.pick();
    if (!serverUrl) throw new Error("No healthy Ollama servers available");
    this.lb.incrementInFlight(serverUrl);
    try {
      // Use OpenAI SDK pointed at Ollama
      const { OpenAIProvider: P } = await import("./openai.js");
      const p = new P("ollama", `${serverUrl}/v1`);
      return await p.chat(messages, options);
    } finally {
      this.lb.decrementInFlight(serverUrl);
    }
  }
}
