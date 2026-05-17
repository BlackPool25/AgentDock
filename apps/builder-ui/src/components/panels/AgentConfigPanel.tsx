import { useState } from "react";
import { useCanvasStore } from "@/stores/canvas.store.js";
import { cn } from "@/lib/utils.js";
import type { AgentDesign, AgentAction } from "@agentdock/config-schema";

const TABS = ["General", "LLM", "Memory", "Shell", "MCPs", "Tools", "Actions", "Expose"] as const;
type Tab = (typeof TABS)[number];

const PROVIDERS = ["ollama", "openai", "anthropic", "gemini", "groq"] as const;
const EXPOSE_OPTIONS = ["logs", "chat", "memory", "status", "tasks"] as const;

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
            <Field label="Agent ID">
              <input
                className="input"
                value={data.id}
                onChange={(e) => update({ id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
              />
            </Field>
            <Field label="Name">
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
              <input className="input" value={data.llm.model} onChange={(e) => update({ llm: { ...data.llm, model: e.target.value } })} />
            </Field>
            <Field label={`Temperature (${data.llm.temperature})`}>
              <input
                type="range" min="0" max="2" step="0.1"
                value={data.llm.temperature}
                onChange={(e) => update({ llm: { ...data.llm, temperature: parseFloat(e.target.value) } })}
                className="w-full accent-primary"
              />
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
                value={data.llm.systemPrompt}
                onChange={(e) => update({ llm: { ...data.llm, systemPrompt: e.target.value } })}
              />
            </Field>
          </>
        )}

        {tab === "Memory" && (
          <MemoryTab nodeId={nodeId} data={data} update={update} />
        )}

        {tab === "Shell" && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.shell.enabled}
              onChange={(e) => update({ shell: { enabled: e.target.checked } })}
              className="accent-primary"
            />
            <span className="text-sm">Enable shell access</span>
          </label>
        )}

        {tab === "MCPs" && (
          <div className="space-y-3">
            {data.mcps.map((mcp, i) => (
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
                  {Object.entries(mcp.env).map(([k, v], ei) => (
                    <div key={ei} className="flex gap-1">
                      <input
                        className="input text-xs font-mono flex-1"
                        placeholder="KEY"
                        value={k}
                        onChange={(e) => {
                          const mcps = [...data.mcps];
                          const env = Object.fromEntries(
                            Object.entries(mcps[i].env).map(([ek, ev], idx) =>
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
                          mcps[i] = { ...mcps[i], env: { ...mcps[i].env, [k]: e.target.value } };
                          update({ mcps });
                        }}
                      />
                      <button
                        className="text-xs text-destructive px-1"
                        onClick={() => {
                          const mcps = [...data.mcps];
                          const env = Object.fromEntries(
                            Object.entries(mcps[i].env).filter((_, idx) => idx !== ei)
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
                      mcps[i] = { ...mcps[i], env: { ...mcps[i].env, "": "" } };
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
                value={data.tools.pythonPackages.join("\n")}
                onChange={(e) => update({ tools: { ...data.tools, pythonPackages: e.target.value.split("\n").filter(Boolean) } })}
              />
            </Field>
            <Field label="System Packages (one per line)">
              <textarea
                className="input resize-none font-mono text-xs"
                rows={3}
                value={data.tools.systemPackages.join("\n")}
                onChange={(e) => update({ tools: { ...data.tools, systemPackages: e.target.value.split("\n").filter(Boolean) } })}
              />
            </Field>
          </>
        )}

        {tab === "Actions" && (
          <ActionsTab data={data} update={update} />
        )}

        {tab === "Expose" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Select which endpoints are accessible via API key</p>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
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
      ? [...data.memory.readableBy, agentId]
      : data.memory.readableBy.filter((id) => id !== agentId);
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
                  checked={data.memory.readableBy.includes(a.id)}
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
      <p className="text-xs text-muted-foreground">
        Actions are named tasks this agent executes when triggered. Each action has a prompt template and optional output file.
      </p>

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
            <p className="text-xs text-muted-foreground mt-1">Use {"{{input.field}}"} for input placeholders.</p>
          </Field>

          <Field label="Output File (optional, relative to /memory)">
            <input
              className="input text-xs font-mono"
              placeholder="analysis.md"
              value={action.outputFile ?? ""}
              onChange={(e) => updateAction(i, { outputFile: e.target.value || undefined })}
            />
          </Field>
        </div>
      ))}

      <button className="text-xs text-primary hover:underline" onClick={addAction}>
        + Add Action
      </button>
    </div>
  );
}
