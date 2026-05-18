import { useState } from "react";
import { useCanvasStore } from "@/stores/canvas.store.js";
import { cn } from "@/lib/utils.js";
import type { AgentDesign, AgentAction } from "@agentdock/config-schema";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

const TABS = ["General", "LLM", "Memory", "RAG", "Triggers", "Shell", "MCPs", "Tools", "Actions", "Seed", "Input", "Expose"] as const;
type Tab = (typeof TABS)[number];

const PROVIDERS = ["ollama", "openai", "anthropic", "gemini", "groq"] as const;
const EXPOSE_OPTIONS = ["logs", "chat", "memory", "status", "tasks"] as const;

const TOOL_CALL_WARNING_TEMP = 0.5;
const RECOMMENDED_MODELS: Record<string, string[]> = {
  ollama: ["qwen2.5:7b", "qwen2.5:14b", "qwen2.5-coder:7b", "llama3.1:8b"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  anthropic: ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash"],
  groq: ["llama-3.1-70b-versatile", "mixtral-8x7b-32768"],
};

function ValidationBadge({ data }: { data: AgentDesign }) {
  const warnings: string[] = [];
  const ok: string[] = [];

  if (!data.llm.model.trim()) warnings.push("LLM model is empty");
  if (data.llm.temperature > TOOL_CALL_WARNING_TEMP && data.shell.enabled) {
    warnings.push(`Temperature ${data.llm.temperature} is high for tool-calling agents (use ≤0.3)`);
  }
  if (!data.actions.length) warnings.push("No actions defined — agent will use default prompt");
  const hasTrigger = data.triggers.length > 0;
  if (!hasTrigger) warnings.push("No triggers — agent cannot be activated");
  if (!data.llm.systemPrompt.trim()) warnings.push("System prompt is empty");

  if (data.actions.length > 0) ok.push(`${data.actions.length} action(s) configured`);
  if (hasTrigger) ok.push(`${data.triggers.length} trigger(s) active`);
  if (data.shell.enabled) ok.push("Shell enabled");
  if (data.mcps.length > 0) ok.push(`${data.mcps.length} MCP(s) connected`);

  if (warnings.length === 0 && ok.length === 0) return null;

  return (
    <div className="px-4 py-2 border-b border-border bg-muted/30 space-y-1">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-1.5 text-xs text-amber-400">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{w}</span>
        </div>
      ))}
      {ok.map((o, i) => (
        <div key={i} className="flex items-start gap-1.5 text-xs text-green-400">
          <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{o}</span>
        </div>
      ))}
    </div>
  );
}

export function AgentConfigPanel({ nodeId }: { nodeId: string }) {
  const [tab, setTab] = useState<Tab>("General");
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === nodeId));
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  if (!node) return null;
  const data = node.data as AgentDesign;

  const update = (patch: Partial<AgentDesign>) => updateNodeData(nodeId, patch);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-semibold">Agent Config</p>
        <p className="text-xs text-muted-foreground font-mono">{data.id}</p>
      </div>

      <ValidationBadge data={data} />

      {/* Tabs */}
      <div className="flex gap-1 px-3 pt-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "text-xs px-2 py-1 rounded transition-colors",
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab === "General" && (
          <>
            <Field label="Agent ID (lowercase, hyphens)">
              <input
                className="input font-mono"
                value={data.id}
                onChange={(e) => update({ id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
              />
            </Field>
            <Field label="Display Name">
              <input className="input" value={data.name} onChange={(e) => update({ name: e.target.value })} />
            </Field>
            <Field label="Description">
              <textarea
                className="input resize-none"
                rows={3}
                value={data.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </Field>
          </>
        )}

        {tab === "LLM" && (
          <>
            <Field label="Provider">
              <select
                className="input"
                value={data.llm.provider}
                onChange={(e) => update({ llm: { ...data.llm, provider: e.target.value as AgentDesign["llm"]["provider"] } })}
              >
                {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Model">
              <input className="input font-mono" value={data.llm.model} onChange={(e) => update({ llm: { ...data.llm, model: e.target.value } })} />
              {RECOMMENDED_MODELS[data.llm.provider] && (
                <div className="mt-1">
                  <p className="text-[10px] text-muted-foreground mb-1">Recommended:</p>
                  <div className="flex flex-wrap gap-1">
                    {RECOMMENDED_MODELS[data.llm.provider].map((m) => (
                      <button
                        key={m}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 transition-colors"
                        onClick={() => update({ llm: { ...data.llm, model: m } })}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Field>
            <Field label={`Temperature (${data.llm.temperature.toFixed(1)})`}>
              <input
                type="range" min="0" max="2" step="0.1"
                value={data.llm.temperature}
                onChange={(e) => update({ llm: { ...data.llm, temperature: parseFloat(e.target.value) } })}
                className="w-full accent-primary"
              />
              {data.llm.temperature > TOOL_CALL_WARNING_TEMP && (
                <p className="text-[10px] text-amber-400 mt-1">⚠ High temperature may cause malformed tool call JSON. Use ≤0.3 for tool-calling agents.</p>
              )}
            </Field>
            <Field label="Max Tokens">
              <input
                type="number" className="input"
                value={data.llm.maxTokens}
                onChange={(e) => update({ llm: { ...data.llm, maxTokens: parseInt(e.target.value) || 4096 } })}
              />
            </Field>
            <Field label="System Prompt">
              <textarea
                className="input resize-none font-mono text-xs"
                rows={6}
                placeholder="You are a helpful assistant..."
                value={data.llm.systemPrompt}
                onChange={(e) => update({ llm: { ...data.llm, systemPrompt: e.target.value } })}
              />
            </Field>
          </>
        )}

        {tab === "Memory" && (
          <MemoryTab nodeId={nodeId} data={data} update={update} />
        )}

        {tab === "RAG" && (
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.rag?.enabled}
                onChange={(e) => update({ rag: { ...(data.rag || {}), enabled: e.target.checked } as any })}
                className="accent-primary"
              />
              <span className="text-sm font-medium">Enable RAG</span>
            </label>

            {data.rag?.enabled && (
              <div className="space-y-3 pl-6 border-l-2 border-primary/20">
                <Field label="Embedding Model">
                  <select
                    className="input text-xs"
                    value={data.rag.embedding_model}
                    onChange={(e) => update({ rag: { ...data.rag, embedding_model: e.target.value } as any })}
                  >
                    <option value="all-MiniLM-L6-v2">all-MiniLM-L6-v2 (Fast/CPU)</option>
                    <option value="all-mpnet-base-v2">all-mpnet-base-v2 (High Quality)</option>
                  </select>
                </Field>
                <div className="flex gap-2">
                  <Field label="Top K" className="flex-1">
                    <input
                      type="number" className="input text-xs"
                      value={data.rag.top_k}
                      onChange={(e) => update({ rag: { ...data.rag, top_k: parseInt(e.target.value) || 5 } as any })}
                    />
                  </Field>
                  <Field label="Max File Size (KB)" className="flex-1">
                    <input
                      type="number" className="input text-xs"
                      value={data.rag.max_file_size_kb}
                      onChange={(e) => update({ rag: { ...data.rag, max_file_size_kb: parseInt(e.target.value) || 500 } as any })}
                    />
                  </Field>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold">Indexed Folders</p>
                  {(data.rag.folders || []).map((folder, fi) => (
                    <div key={fi} className="p-2 rounded bg-muted/50 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono">{folder.path}</span>
                        <button 
                          className="text-[10px] text-destructive"
                          onClick={() => {
                            const folders = (data.rag.folders || []).filter((_, idx) => idx !== fi);
                            update({ rag: { ...data.rag, folders } as any });
                          }}
                        >Remove</button>
                      </div>
                    </div>
                  ))}
                  <button
                    className="btn btn-secondary w-full text-[10px] h-7"
                    onClick={() => {
                      const folders = [...(data.rag.folders || []), { path: "/memory", auto_index: true, file_types: [".md", ".txt"], exclude_files: [] }];
                      update({ rag: { ...data.rag, folders } as any });
                    }}
                  >+ Add Folder</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "Shell" && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.shell.enabled}
                onChange={(e) => update({ shell: { enabled: e.target.checked } })}
                className="accent-primary"
              />
              <span className="text-sm">Enable shell access</span>
            </label>
            {data.shell.enabled && (
              <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30 space-y-1">
                <div className="flex items-center gap-1.5 text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Security Warning</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Shell access allows the agent to execute commands on the host. Only enable for trusted agents.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "MCPs" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              MCP servers provide external tools this agent can use (web search, file access, etc).
            </p>
            {(data.mcps || []).map((mcp, i) => (
              <div key={i} className="p-3 rounded border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">MCP {i + 1}</span>
                  <button
                    className="text-xs text-destructive hover:underline"
                    onClick={() => update({ mcps: data.mcps.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </button>
                </div>
                <input
                  className="input text-xs"
                  placeholder="Name (e.g. youtube-mcp)"
                  value={mcp.name}
                  onChange={(e) => {
                    const mcps = [...data.mcps];
                    mcps[i] = { ...mcps[i], name: e.target.value };
                    update({ mcps });
                  }}
                />
                <select
                  className="input text-xs"
                  value={mcp.transport}
                  onChange={(e) => {
                    const mcps = [...data.mcps];
                    mcps[i] = { ...mcps[i], transport: e.target.value as "sse" | "stdio", url: "", command: "" };
                    update({ mcps });
                  }}
                >
                  <option value="sse">SSE (HTTP)</option>
                  <option value="stdio">stdio (local process)</option>
                </select>
                {mcp.transport === "sse" ? (
                  <input
                    className="input text-xs font-mono"
                    placeholder="http://mcp-server:3000/sse"
                    value={mcp.url ?? ""}
                    onChange={(e) => {
                      const mcps = [...data.mcps];
                      mcps[i] = { ...mcps[i], url: e.target.value };
                      update({ mcps });
                    }}
                  />
                ) : (
                  <input
                    className="input text-xs font-mono"
                    placeholder="command (e.g. npx @modelcontextprotocol/server-filesystem)"
                    value={mcp.command ?? ""}
                    onChange={(e) => {
                      const mcps = [...data.mcps];
                      mcps[i] = { ...mcps[i], command: e.target.value };
                      update({ mcps });
                    }}
                  />
                )}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Env vars</p>
                  {Object.entries(mcp.env || {}).map(([k, v], ei) => (
                    <div key={ei} className="flex gap-1">
                      <input
                        className="input text-xs font-mono flex-1"
                        placeholder="KEY"
                        value={k}
                        onChange={(e) => {
                          const mcps = [...data.mcps];
                          const env = Object.fromEntries(
                            Object.entries(mcps[i].env || {}).map(([ek, ev], idx) =>
                              idx === ei ? [e.target.value, ev] : [ek, ev]
                            )
                          );
                          mcps[i] = { ...mcps[i], env };
                          update({ mcps });
                        }}
                      />
                      <input
                        className="input text-xs font-mono flex-1"
                        placeholder="${ENV_VAR}"
                        value={v}
                        onChange={(e) => {
                          const mcps = [...data.mcps];
                          mcps[i] = { ...mcps[i], env: { ...(mcps[i].env || {}), [k]: e.target.value } };
                          update({ mcps });
                        }}
                      />
                      <button
                        className="text-xs text-destructive px-1"
                        onClick={() => {
                          const mcps = [...data.mcps];
                          const env = Object.fromEntries(
                            Object.entries(mcps[i].env || {}).filter((_, idx) => idx !== ei)
                          );
                          mcps[i] = { ...mcps[i], env };
                          update({ mcps });
                        }}
                      >×</button>
                    </div>
                  ))}
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      const mcps = [...data.mcps];
                      mcps[i] = { ...mcps[i], env: { ...(mcps[i].env || {}), "": "" } };
                      update({ mcps });
                    }}
                  >+ Add env var</button>
                </div>
              </div>
            ))}
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => update({ mcps: [...data.mcps, { name: "", transport: "sse", url: "", env: {} }] })}
            >
              + Add MCP
            </button>
          </div>
        )}

        {tab === "Tools" && (
          <>
            <Field label="Python Packages (one per line)">
              <textarea
                className="input resize-none font-mono text-xs"
                rows={4}
                placeholder="requests\nbeautifulsoup4"
                value={data.tools.pythonPackages.join("\n")}
                onChange={(e) => update({ tools: { ...data.tools, pythonPackages: e.target.value.split("\n").filter(Boolean) } })}
              />
            </Field>
            <Field label="System Packages (one per line)">
              <textarea
                className="input resize-none font-mono text-xs"
                rows={3}
                placeholder="curl\njq"
                value={data.tools.systemPackages.join("\n")}
                onChange={(e) => update({ tools: { ...data.tools, systemPackages: e.target.value.split("\n").filter(Boolean) } })}
              />
            </Field>
          </>
        )}

        {tab === "Actions" && (
          <ActionsTab data={data} update={update} />
        )}

        {tab === "Seed" && (
          <SeedFilesTab data={data} update={update} />
        )}

        {tab === "Input" && (
          <InsufficientInputTab data={data} update={update} />
        )}

        {tab === "Triggers" && (
          <TriggersTab data={data} update={update} />
        )}

        {tab === "Expose" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Select which endpoints are accessible via the orchestrator proxy</p>
            {EXPOSE_OPTIONS.map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.expose.includes(opt)}
                  onChange={(e) => {
                    const expose = e.target.checked
                      ? [...data.expose, opt]
                      : data.expose.filter((x) => x !== opt);
                    update({ expose });
                  }}
                  className="accent-primary"
                />
                <span className="text-sm font-mono">{opt}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function TriggersTab({
  data,
  update,
}: {
  data: AgentDesign;
  update: (patch: Partial<AgentDesign>) => void;
}) {
  const triggers = data.triggers || [];

  const addTrigger = (type: "webhook" | "cron" | "task") => {
    let newTrigger: any = { type };
    if (type === "cron") {
      newTrigger = { ...newTrigger, schedule: "0 9 * * 1-5", timezone: "UTC", actionName: "" };
    }
    update({ triggers: [...triggers, newTrigger] });
  };

  const updateTrigger = (i: number, patch: any) => {
    const next = triggers.map((t, idx) => idx === i ? { ...t, ...patch } : t);
    update({ triggers: next });
  };

  const removeTrigger = (i: number) =>
    update({ triggers: triggers.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground">
            Triggers define how this agent is activated. <strong>At least one trigger is required</strong> for the agent to respond to events.
          </p>
        </div>
      </div>

      {triggers.map((trigger, i) => (
        <div key={i} className="p-3 rounded border border-border space-y-2 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-primary">{trigger.type}</span>
            <button className="text-xs text-destructive hover:underline" onClick={() => removeTrigger(i)}>
              Remove
            </button>
          </div>

          {trigger.type === "webhook" && (
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground">
                Path: <code className="bg-muted px-1 rounded">/webhooks/{data.id}</code>
              </p>
              <Field label="Target Action (Optional)">
                <select
                  className="input text-xs"
                  value={(trigger as any).actionName || ""}
                  onChange={(e) => updateTrigger(i, { actionName: e.target.value || undefined })}
                >
                  <option value="">(Default / Auto-detect)</option>
                  {data.actions.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                </select>
              </Field>
            </div>
          )}

          {trigger.type === "cron" && (
            <div className="space-y-2">
              <Field label="Schedule (Cron Expression)">
                <input
                  className="input text-xs font-mono"
                  placeholder="0 0 * * *"
                  value={(trigger as any).schedule}
                  onChange={(e) => updateTrigger(i, { schedule: e.target.value })}
                />
              </Field>
              <Field label="Target Action (Required)">
                <select
                  className="input text-xs"
                  value={(trigger as any).actionName || ""}
                  onChange={(e) => updateTrigger(i, { actionName: e.target.value || undefined })}
                >
                  <option value="">Select an action...</option>
                  {data.actions.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                </select>
              </Field>
            </div>
          )}

          {trigger.type === "task" && (
            <div className="p-2 rounded bg-muted/50">
              <p className="text-xs text-muted-foreground">
                Internal task trigger. This agent can receive tasks from other agents via the orchestrator.
              </p>
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-2">
        <button className="btn btn-secondary flex-1 text-[10px] h-7" onClick={() => addTrigger("webhook")}>+ Webhook</button>
        <button className="btn btn-secondary flex-1 text-[10px] h-7" onClick={() => addTrigger("cron")}>+ Cron</button>
        <button className="btn btn-secondary flex-1 text-[10px] h-7" onClick={() => addTrigger("task")}>+ Task</button>
      </div>
    </div>
  );
}

function MemoryTab({
  nodeId,
  data,
  update,
}: {
  nodeId: string;
  data: AgentDesign;
  update: (patch: Partial<AgentDesign>) => void;
}) {
  const otherAgents = useCanvasStore((s) =>
    s.nodes.filter((n) => n.id !== nodeId).map((n) => ({ id: (n.data as AgentDesign).id, name: (n.data as AgentDesign).name }))
  );

  const toggleReadableBy = (agentId: string, checked: boolean) => {
    const readableBy = checked
      ? [...(data.memory.readableBy || []), agentId]
      : (data.memory.readableBy || []).filter((id) => id !== agentId);
    update({ memory: { ...data.memory, readableBy } });
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={data.memory.gitAutoCommit}
          onChange={(e) => update({ memory: { ...data.memory, gitAutoCommit: e.target.checked } })}
          className="accent-primary"
        />
        <span className="text-sm">Git auto-commit memory changes</span>
      </label>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Readable by other agents</p>
        {otherAgents.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No other agents in canvas</p>
        ) : (
          <div className="space-y-1">
            {otherAgents.map((a) => (
              <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(data.memory.readableBy || []).includes(a.id)}
                  onChange={(e) => toggleReadableBy(a.id, e.target.checked)}
                  className="accent-primary"
                />
                <span className="text-sm">{a.name}</span>
                <span className="text-xs text-muted-foreground font-mono">{a.id}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionsTab({
  data,
  update,
}: {
  data: AgentDesign;
  update: (patch: Partial<AgentDesign>) => void;
}) {
  const actions = data.actions ?? [];

  const addAction = () => {
    update({
      actions: [
        ...actions,
        {
          name: `action-${actions.length + 1}`,
          description: "",
          inputSchema: {},
          outputSchema: {},
          promptTemplate: "",
          outputFile: undefined,
        } satisfies AgentAction,
      ],
    });
  };

  const updateAction = (i: number, patch: Partial<AgentAction>) => {
    const next = actions.map((a, idx) => idx === i ? { ...a, ...patch } : a);
    update({ actions: next });
  };

  const removeAction = (i: number) =>
    update({ actions: actions.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-3">
      <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground">
            Actions are named tasks this agent executes when triggered. Each action needs a <strong>prompt template</strong> and an <strong>output file</strong> to trigger downstream agents.
          </p>
        </div>
      </div>

      {actions.map((action, i) => (
        <div key={i} className="p-3 rounded border border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground font-mono">{action.name || `action-${i + 1}`}</span>
            <button className="text-xs text-destructive hover:underline" onClick={() => removeAction(i)}>
              Remove
            </button>
          </div>

          <Field label="Action Name (snake_case)">
            <input
              className="input text-xs font-mono"
              placeholder="analyse_request"
              value={action.name}
              onChange={(e) => updateAction(i, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
            />
          </Field>

          <Field label="Description">
            <input
              className="input text-xs"
              placeholder="What this action does"
              value={action.description}
              onChange={(e) => updateAction(i, { description: e.target.value })}
            />
          </Field>

          <Field label="Prompt Template">
            <textarea
              className="input resize-none font-mono text-xs"
              rows={4}
              placeholder={"Analyse the following request:\n\n{{input.request}}\n\nWrite your analysis to memory."}
              value={action.promptTemplate}
              onChange={(e) => updateAction(i, { promptTemplate: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">Use {"{{input.field}}"} for input placeholders. {"{{input.request}}"} is always available.</p>
          </Field>

          <Field label="Output File (relative to /memory)">
            <input
              className="input text-xs font-mono"
              placeholder="analysis.md"
              value={action.outputFile ?? ""}
              onChange={(e) => updateAction(i, { outputFile: e.target.value || undefined })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              When set, writing this file triggers downstream agents with <code>file_received</code> connections.
            </p>
          </Field>
        </div>
      ))}

      <button className="text-xs text-primary hover:underline" onClick={addAction}>
        + Add Action
      </button>
    </div>
  );
}

function SeedFilesTab({
  data,
  update,
}: {
  data: AgentDesign;
  update: (patch: Partial<AgentDesign>) => void;
}) {
  const seedFiles = (data as any).seedFiles || [];

  const addSeedFile = (file: { filename: string; type: "text" | "pdf"; content: string; extractedText?: string }) => {
    update({ seedFiles: [...seedFiles, file] } as any);
  };

  const removeSeedFile = (i: number) => {
    update({ seedFiles: seedFiles.filter((_f: any, idx: number) => idx !== i) } as any);
  };

  const updateSeedFile = (i: number, patch: Partial<{ filename: string; type: "text" | "pdf"; content: string; extractedText?: string }>) => {
    const next = seedFiles.map((f: any, idx: number) => idx === i ? { ...f, ...patch } : f);
    update({ seedFiles: next } as any);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith(".pdf")) {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      addSeedFile({ filename: file.name, type: "pdf", content: base64 });
    } else {
      const text = await file.text();
      addSeedFile({ filename: file.name, type: "text", content: text });
    }
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
      <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground">
            Seed files provide base knowledge to the agent. PDFs are extracted at build time. Files are copied to <code className="bg-muted px-1 rounded">/memory/</code> on agent startup.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <label className="btn btn-secondary flex-1 text-[10px] h-7 cursor-pointer text-center">
          + Upload File (PDF/TXT/MD)
          <input type="file" className="hidden" accept=".pdf,.txt,.md,.json,.yaml,.yml,.csv" onChange={handleFileUpload} />
        </label>
      </div>

      {seedFiles.length === 0 && (
        <p className="text-xs text-muted-foreground italic text-center py-4">No seed files added</p>
      )}

      {seedFiles.map((sf: any, i: number) => (
        <div key={i} className="p-3 rounded border border-border space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono">{sf.filename}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary uppercase">{sf.type}</span>
            </div>
            <button className="text-xs text-destructive hover:underline" onClick={() => removeSeedFile(i)}>
              Remove
            </button>
          </div>

          <Field label="Filename">
            <input
              className="input text-xs font-mono"
              value={sf.filename}
              onChange={(e) => updateSeedFile(i, { filename: e.target.value })}
            />
          </Field>

          {sf.type === "text" && (
            <Field label="Content">
              <textarea
                className="input resize-none font-mono text-xs"
                rows={4}
                value={sf.content}
                onChange={(e) => updateSeedFile(i, { content: e.target.value })}
              />
            </Field>
          )}

          {sf.type === "pdf" && (
            <div className="p-2 rounded bg-muted/50">
              <p className="text-[10px] text-muted-foreground">
                PDF content stored as base64. Text will be extracted at build time.
              </p>
              {sf.extractedText && (
                <details className="mt-1">
                  <summary className="text-[10px] text-primary cursor-pointer">View extracted text</summary>
                  <pre className="text-[10px] font-mono mt-1 max-h-32 overflow-auto whitespace-pre-wrap">{sf.extractedText}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function InsufficientInputTab({
  data,
  update,
}: {
  data: AgentDesign;
  update: (patch: Partial<AgentDesign>) => void;
}) {
  const config = (data as any).insufficientInput || { enabled: false, message: "", fallbackAction: "return_error" };

  return (
    <div className="space-y-3">
      <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground">
            Configure how the agent responds when the input is not sufficient or valid to proceed with its task.
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => update({ insufficientInput: { ...config, enabled: e.target.checked } } as any)}
          className="accent-primary"
        />
        <span className="text-sm font-medium">Enable insufficient input handling</span>
      </label>

      {config.enabled && (
        <div className="space-y-3 pl-6 border-l-2 border-primary/20">
          <Field label="Response Message">
            <textarea
              className="input resize-none text-xs"
              rows={3}
              value={config.message}
              onChange={(e) => update({ insufficientInput: { ...config, message: e.target.value } } as any)}
              placeholder="I don't have enough information to proceed..."
            />
          </Field>

          <Field label="Fallback Action">
            <select
              className="input text-xs"
              value={config.fallbackAction}
              onChange={(e) => update({ insufficientInput: { ...config, fallbackAction: e.target.value } } as any)}
            >
              <option value="return_error">Return error message to user</option>
              <option value="ask_clarification">Ask for clarification</option>
              <option value="use_defaults">Use default values and proceed</option>
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}
