export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResult {
  output: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMProvider {
  name: string;
  chat(messages: Message[], options: LLMOptions): Promise<LLMResult>;
}
