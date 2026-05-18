import { OpenAIProvider } from "./openai.js";
import type { LLMOptions, LLMResult, SyncChatResult, Message } from "./base.js";
import { OllamaLoadBalancer } from "../loadbalancer/ollama-lb.js";

export class OllamaProvider extends OpenAIProvider {
  private lb: OllamaLoadBalancer;

  constructor(lb: OllamaLoadBalancer) {
    super("ollama", "");
    this.name = "ollama";
    this.lb = lb;
  }

  private _provider(): OpenAIProvider {
    const url = this.lb.pick();
    if (!url) throw new Error("No healthy Ollama servers available");
    return new OpenAIProvider("ollama", `${url}/v1`);
  }

  async chat(messages: Message[], options: LLMOptions): Promise<LLMResult> {
    const url = this.lb.pick();
    if (!url) throw new Error("No healthy Ollama servers available");
    this.lb.incrementInFlight(url);
    try {
      return await new OpenAIProvider("ollama", `${url}/v1`).chat(messages, options);
    } finally {
      this.lb.decrementInFlight(url);
    }
  }

  async chatWithTools(messages: Message[], options: LLMOptions): Promise<SyncChatResult> {
    const url = this.lb.pick();
    if (!url) throw new Error("No healthy Ollama servers available");
    this.lb.incrementInFlight(url);
    try {
      return await new OpenAIProvider("ollama", `${url}/v1`).chatWithTools(messages, options);
    } finally {
      this.lb.decrementInFlight(url);
    }
  }
}
