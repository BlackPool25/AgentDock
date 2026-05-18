import { OpenAIProvider } from "./openai.js";

export class GroqProvider extends OpenAIProvider {
  constructor(apiKey: string) {
    super(apiKey, "https://api.groq.com/openai/v1");
    this.name = "groq";
  }
}
