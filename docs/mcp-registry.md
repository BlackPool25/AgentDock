# AgentDock MCP Registry

AgentDock uses **Smithery** as its MCP discovery layer. Instead of shipping a hardcoded list of domain-specific servers, the builder queries the Smithery registry live during agent generation and surfaces the most relevant MCP servers for each system description.

---

## How It Works

When you click **Describe** in the builder, the generation pipeline:

1. **Analyzes intent** — extracts the agents, data flows, and tool requirements from your description.
2. **Queries Smithery** — calls `GET https://api.smithery.ai/servers?q={description}` to find the top 8 semantically relevant MCP servers for the system.
3. **Injects the results** — the LLM sees the discovered servers alongside the 4 platform MCPs and decides which ones to configure for each agent.
4. **Configures connections** — stdio platform MCPs use `npx` commands; Smithery-hosted MCPs use streamable-http URLs.

This means AgentDock works with **any MCP server on Smithery**, not just a pre-approved EdTech bundle.

---

## Two MCP Tiers

### Tier 1 — Platform MCPs (always available)

These 4 servers are bundled with every AgentDock project. No API key or cloud connection needed.

| MCP | Package | Command | Use when |
|-----|---------|---------|----------|
| `filesystem` | `@modelcontextprotocol/server-filesystem` | `npx -y @modelcontextprotocol/server-filesystem /workspace` | Reading/writing local files, agent memory |
| `memory-kg` | `@modelcontextprotocol/server-memory` | `npx -y @modelcontextprotocol/server-memory` | Persistent cross-session knowledge graph memory |
| `sequential-thinking` | `@modelcontextprotocol/server-sequential-thinking` | `npx -y @modelcontextprotocol/server-sequential-thinking` | Structured multi-step reasoning |
| `web-fetch` | `@modelcontextprotocol/server-fetch` | `npx -y @modelcontextprotocol/server-fetch` | Fetching and parsing arbitrary URLs |

**Configuration schema (stdio):**
```yaml
mcps:
  - name: filesystem
    transport: stdio
    command: "npx -y @modelcontextprotocol/server-filesystem /workspace"
    env: {}
```

---

### Tier 2 — Smithery-Hosted MCPs (dynamic discovery)

Any MCP server published on [smithery.ai](https://smithery.ai) with `remote: true` can be connected via streamable-http. No local installation needed — Smithery hosts the server for you.

**Configuration schema (streamable-http):**
```yaml
mcps:
  - name: brave
    transport: streamable-http
    url: "https://server.smithery.ai/brave/mcp"
    env:
      SMITHERY_API_KEY: "${SMITHERY_API_KEY}"
```

**URL pattern:** `https://server.smithery.ai/{qualifiedName}/mcp`

The `qualifiedName` is the server's registry identifier (e.g. `brave`, `pubmed`, `@modelcontextprotocol/github`). You can find it on the server's Smithery page.

---

## Enabling Live Discovery

Add your Smithery API key to `.env`:

```env
SMITHERY_API_KEY=your_key_here
```

Get your key at [smithery.ai/account/api-keys](https://smithery.ai/account/api-keys).

**Without this key**, the designer still works — it only shows the 4 platform MCPs and the LLM uses its training knowledge to configure any additional servers requested.

---

## MCP Selection Philosophy

AgentDock follows a **minimal footprint** principle:

1. **Builtin tools first** — `search_web`, `fetch_url`, `run_code` cover most agent needs without any MCP overhead.
2. **Platform MCPs second** — filesystem and memory for state management.
3. **Smithery MCPs last** — only when an agent genuinely requires an external service integration (e.g., sending an email, querying a database API, reading a calendar).

Every MCP added to an agent config increases startup time and adds a new failure point. The designer is instructed to never include MCPs speculatively.

---

## Browsing the Smithery Registry

You can browse all available MCPs at [smithery.ai/servers](https://smithery.ai/servers) or search via the API:

```bash
curl "https://api.smithery.ai/servers?q=github&pageSize=5" \
  -H "Authorization: Bearer $SMITHERY_API_KEY"
```

The response includes the `qualifiedName` you need to build the connection URL.
