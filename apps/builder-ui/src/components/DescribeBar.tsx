import { useState, useEffect } from "react";
import { Sparkles, Loader2, Pencil, Bot } from "lucide-react";
import { systemsApi } from "../api/systems.api.js";

interface Props {
  onDescribe: (description: string, provider: string, model: string) => Promise<void>;
  onPatch: (change: string) => Promise<void>;
  hasNodes: boolean;
  isLoading: boolean;
}

const PROVIDERS = ["groq", "ollama", "openai", "anthropic", "gemini"] as const;
const RECOMMENDED_MODELS: Record<string, string[]> = {
  groq: ["llama-3.1-70b-versatile", "mixtral-8x7b-32768"],
  ollama: ["qwen3:8b", "llama3.1:8b", "qwen2.5:7b", "qwen2.5:14b", "qwen2.5-coder:7b"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  anthropic: ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash"],
};

export function DescribeBar({ onDescribe, onPatch, hasNodes, isLoading }: Props) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"describe" | "patch">("describe");
  const [provider, setProvider] = useState<string>("ollama");
  const [model, setModel] = useState<string>("qwen3:8b");
  const [ollamaModels, setOllamaModels] = useState<string[]>(RECOMMENDED_MODELS.ollama);
  const [isCustomModel, setIsCustomModel] = useState(false);

  useEffect(() => {
    let active = true;
    systemsApi.getOllamaModels()
      .then((res) => {
        if (active && res.models && res.models.length > 0) {
          setOllamaModels(res.models);
          if (res.models.length > 0 && !res.models.includes(model)) {
            setModel(res.models[0]);
          }
        }
      })
      .catch(() => {
        // Graceful fallback
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isLoading) return;
    if (mode === "patch") {
      await onPatch(value.trim());
    } else {
      await onDescribe(value.trim(), provider, model);
    }
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/50">
      {hasNodes && (
        <div className="flex rounded-md border border-border overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setMode("describe")}
            className={`px-2 py-1 text-xs transition-colors ${mode === "describe" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
          >
            Generate
          </button>
          <button
            type="button"
            onClick={() => setMode("patch")}
            className={`px-2 py-1 text-xs transition-colors ${mode === "patch" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
          >
            <Pencil className="w-3 h-3 inline mr-1" />Patch
          </button>
        </div>
      )}

      {mode === "describe" && (
        <div className="flex items-center gap-1.5 border border-border rounded-lg px-2.5 py-1 bg-muted/30 shrink-0 hover:border-primary/30 transition-all select-none">
          <Bot className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">LLM:</span>
          <select
            value={provider}
            onChange={(e) => {
              const p = e.target.value;
              setProvider(p);
              setIsCustomModel(false);
              const models = p === "ollama" ? ollamaModels : RECOMMENDED_MODELS[p] || [];
              if (models.length > 0) {
                setModel(models[0]);
              }
            }}
            className="bg-transparent text-xs font-semibold text-foreground border-none outline-none cursor-pointer focus:ring-0 focus:text-primary transition-colors"
            disabled={isLoading}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p} className="bg-card text-foreground">
                {p === "openai" ? "OpenAI" : p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground/30 text-xs">/</span>
          {isCustomModel ? (
            <div className="flex items-center">
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Custom model..."
                className="bg-transparent text-xs font-mono text-primary border-b border-primary/30 outline-none w-[90px] focus:border-primary transition-colors"
                disabled={isLoading}
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setIsCustomModel(false);
                  const models = provider === "ollama" ? ollamaModels : RECOMMENDED_MODELS[provider] || [];
                  if (models.length > 0) setModel(models[0]);
                }}
                className="text-muted-foreground hover:text-primary text-[10px] ml-1.5 font-semibold transition-colors"
              >
                Reset
              </button>
            </div>
          ) : (
            <select
              value={model}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "custom") {
                  setIsCustomModel(true);
                  setModel("");
                } else {
                  setModel(val);
                }
              }}
              className="bg-transparent text-xs font-mono text-muted-foreground border-none outline-none cursor-pointer max-w-[130px] truncate focus:ring-0 focus:text-primary transition-colors"
              disabled={isLoading}
            >
              {(provider === "ollama" ? ollamaModels : RECOMMENDED_MODELS[provider] || []).map((m) => (
                <option key={m} value={m} className="bg-card text-foreground font-mono">
                  {m}
                </option>
              ))}
              <option value="custom" className="bg-card text-primary font-semibold">
                Custom...
              </option>
            </select>
          )}
        </div>
      )}

      <div className="flex-1 flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-1.5 border border-border focus-within:border-primary/50 transition-colors">
        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={
            mode === "patch"
              ? "Describe a change… e.g. make the quiz 5 questions"
              : "Describe your workflow… e.g. I want to help JEE students identify weak topics"
          }
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          disabled={isLoading}
        />
      </div>
      <button
        type="submit"
        disabled={!value.trim() || isLoading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0"
      >
        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        {isLoading ? "Building…" : mode === "patch" ? "Apply" : "Generate"}
      </button>
    </form>
  );
}
