export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCallRequest[];
  tool_call_id?: string;
}

export interface ToolCallRequest {
  id: string;
  type: "function";
  function: { name: string; arguments: Record<string, unknown> };
}

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: unknown[];
}

export interface LLMResult {
  output: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface SyncChatResult {
  content: string;
  toolCalls?: ToolCallResult[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMProvider {
  name: string;
  chat(messages: Message[], options: LLMOptions): Promise<LLMResult>;
  /** Synchronous chat with optional tool calling support. */
  chatWithTools(messages: Message[], options: LLMOptions): Promise<SyncChatResult>;
}
