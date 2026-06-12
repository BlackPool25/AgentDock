// Types inlined from @agentdock/shared-types for standalone runtime

export interface LLMJob {
  jobId: string;
  agentId: string;
  provider: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string; tool_calls?: unknown[]; tool_call_id?: string }>;
  temperature?: number;
  maxTokens?: number;
  callbackUrl: string;
}

export interface LLMJobResult {
  jobId: string;
  output: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface LLMJobError {
  jobId: string;
  error: string;
}
