import { readFileSync, writeFileSync, existsSync } from "fs";
import type { LLMProvider } from "./base.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { GeminiProvider } from "./gemini.js";
import { GroqProvider } from "./groq.js";
import { OllamaProvider } from "./ollama.js";
import { OllamaLoadBalancer } from "../loadbalancer/ollama-lb.js";
import { logger } from "../logger.js";

export interface ProviderConfig {
  name: string;
  type: "openai" | "anthropic" | "gemini" | "groq" | "ollama";
  apiKey?: string;
  baseURL?: string;
}

const PROVIDERS_FILE = process.env.DATA_DIR
  ? `${process.env.DATA_DIR}/providers.json`
  : "/app/data/providers.json";

class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();
  private ollamaLb: OllamaLoadBalancer;

  constructor() {
    const ollamaServers = (process.env.OLLAMA_SERVERS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.ollamaLb = new OllamaLoadBalancer(ollamaServers);
    this.load();
  }

  private load(): void {
    // Register from env vars
    if (process.env.OPENAI_API_KEY) {
      this.providers.set("openai", new OpenAIProvider(process.env.OPENAI_API_KEY));
    }
    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.set("anthropic", new AnthropicProvider(process.env.ANTHROPIC_API_KEY));
    }
    if (process.env.GEMINI_API_KEY) {
      this.providers.set("gemini", new GeminiProvider(process.env.GEMINI_API_KEY));
    }
    if (process.env.GROQ_API_KEY) {
      this.providers.set("groq", new GroqProvider(process.env.GROQ_API_KEY));
    }
    this.providers.set("ollama", new OllamaProvider(this.ollamaLb));

    // Load from file
    if (existsSync(PROVIDERS_FILE)) {
      try {
        const configs: ProviderConfig[] = JSON.parse(readFileSync(PROVIDERS_FILE, "utf-8"));
        for (const cfg of configs) this.register(cfg);
      } catch (err) {
        logger.error({ err }, "Failed to load providers.json");
      }
    }
  }

  register(cfg: ProviderConfig): void {
    switch (cfg.type) {
      case "openai":
        this.providers.set(cfg.name, new OpenAIProvider(cfg.apiKey ?? "", cfg.baseURL));
        break;
      case "anthropic":
        this.providers.set(cfg.name, new AnthropicProvider(cfg.apiKey ?? ""));
        break;
      case "gemini":
        this.providers.set(cfg.name, new GeminiProvider(cfg.apiKey ?? ""));
        break;
      case "groq":
        this.providers.set(cfg.name, new GroqProvider(cfg.apiKey ?? ""));
        break;
      case "ollama":
        this.providers.set(cfg.name, new OllamaProvider(this.ollamaLb));
        break;
    }
    this.persist();
  }

  get(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  list(): string[] {
    return [...this.providers.keys()];
  }

  getOllamaLb(): OllamaLoadBalancer {
    return this.ollamaLb;
  }

  private persist(): void {
    // Only persist non-env-var providers
  }
}

export const registry = new ProviderRegistry();
