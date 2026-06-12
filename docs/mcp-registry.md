# AgentDock MCP Registry

52 MCPs across 9 tiers for Indian EdTech pipelines — K-12 through Post-Graduate.

**Legend:** 🟢 Default (pre-wired) | 🟡 Optional (one-click) | 🔴 Advanced (expert)

---

## Default Bundle (ships pre-wired in every project)

| MCP | Package | Env Vars |
|-----|---------|----------|
| Filesystem | `@modelcontextprotocol/server-filesystem` | — |
| PostgreSQL | `@modelcontextprotocol/server-postgres` | `POSTGRES_URL` |
| Redis | `@modelcontextprotocol/server-redis` | `REDIS_URL` |
| Memory (KG) | `@modelcontextprotocol/server-memory` | — |
| Sequential Thinking | `@modelcontextprotocol/server-sequential-thinking` | — |
| Web Fetch | `@modelcontextprotocol/server-fetch` | — |
| Web Search (Brave) | `@modelcontextprotocol/server-brave-search` | `BRAVE_API_KEY` |
| YouTube Transcript | `kimtaeyoon83/mcp-server-youtube-transcript` | — |
| PDF Reader | `@modelcontextprotocol/server-filesystem` | — |
| Google Classroom | `faizan45640/google-classroom-mcp` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` |
| Google Drive | `google-drive-mcp` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` |
| Google Docs | `google-workspace-mcp` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` |
| Google Sheets | `google-workspace-mcp` | same as above |
| IndicTrans2 | `agentdock/mcp-server-indictrans2` | `AI4BHARAT_API_KEY` |
| Gmail | `google-gmail-mcp` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` |
| Docker | `@modelcontextprotocol/server-docker` | — |
| Git | `@modelcontextprotocol/server-git` | — |

---

## Tier 1 — Core Infrastructure

| # | MCP | Status | Action |
|---|-----|--------|--------|
| 1 | Filesystem | 🟢 | connect |
| 2 | PostgreSQL | 🟢 | connect |
| 3 | Redis | 🟢 | connect |
| 4 | SQLite | 🟢 | connect |
| 5 | Memory (Knowledge Graph) | 🟢 | connect |
| 6 | Web Search (Brave) | 🟢 | connect |
| 7 | Web Fetch | 🟢 | connect |

## Tier 2 — Education Platforms

| # | MCP | Status | Action |
|---|-----|--------|--------|
| 8 | Google Classroom | 🟢 | connect |
| 9 | YouTube Transcript | 🟢 | connect |
| 10 | Google Drive | 🟢 | connect |
| 11 | Notion | 🟡 | connect |
| 12 | Moodle | 🟡 | **build** |
| 13 | Khan Academy | 🟡 | connect |
| 14 | Udemy Business | 🟡 | connect |
| 15 | Canvas LMS | 🟡 | connect |
| 16 | GitHub | 🟡 | connect |

## Tier 3 — Research & Academic

| # | MCP | Status | Action |
|---|-----|--------|--------|
| 17 | ArXiv | 🟢 (PG template) | connect |
| 18 | Scientific Papers Multi-Source | 🟡 | connect |
| 19 | PubMed | 🟡 | connect |
| 20 | Semantic Scholar | 🟡 | **build** |
| 21 | Google Scholar | 🔴 | **build** |
| 22 | Shodhganga / JSTOR | 🔴 | **build** |

## Tier 4 — Communication

| # | MCP | Status | Action |
|---|-----|--------|--------|
| 23 | Gmail | 🟢 | connect |
| 24 | Google Calendar | 🟢 | connect |
| 25 | Slack | 🟡 | connect |
| 26 | WhatsApp Business | 🟡 | **build** (MSG91/Gupshup gateway) |
| 27 | Twilio SMS | 🟡 | connect |
| 28 | Microsoft Teams | 🟡 | connect |
| 29 | Telegram Bot | 🟡 | connect |

## Tier 5 — Productivity & Content

| # | MCP | Status | Action |
|---|-----|--------|--------|
| 30 | Google Docs | 🟢 | connect |
| 31 | Google Sheets | 🟢 | connect |
| 32 | Google Slides | 🟡 | connect |
| 33 | PDF Reader/Writer | 🟢 | connect |
| 34 | Puppeteer/Playwright | 🟡 | connect |
| 35 | Firecrawl | 🟡 | connect |

## Tier 6 — Developer & Agent Infra

| # | MCP | Status | Action |
|---|-----|--------|--------|
| 36 | Docker | 🟢 | connect |
| 37 | Git | 🟢 | connect |
| 38 | Sentry | 🟡 | connect |
| 39 | Context7 | 🟡 | connect |
| 40 | Sequential Thinking | 🟢 | connect |

## Tier 7 — Indian Payment & Identity

| # | MCP | Status | Action |
|---|-----|--------|--------|
| 41 | Razorpay | 🟡 | **build** |
| 42 | DigiLocker | 🔴 | **build** (compliance required) |
| 43 | NPCI / UPI Status | 🔴 | **build** |
| 44 | Aadhaar eKYC | 🔴 | **build** (UIDAI compliance) |

## Tier 8 — Language & AI

| # | MCP | Status | Action |
|---|-----|--------|--------|
| 45 | IndicTrans2 / AI4Bharat | 🟢 | **build** |
| 46 | Sarvam AI | 🟡 | **build** |
| 47 | Bhashini (ULCA) | 🟡 | **build** (free govt API) |
| 48 | ElevenLabs TTS | 🟡 | connect |

## Tier 9 — Vector Store & RAG

| # | MCP | Status | Action |
|---|-----|--------|--------|
| 49 | Chroma | 🟢 | connect |
| 50 | Qdrant | 🟡 | connect |
| 51 | Cognee (Knowledge Graph) | 🟡 | connect |
| 52 | ApeRAG | 🔴 | connect |

---

## Audience Auto-Suggest

When a user selects their target audience, these MCPs are auto-suggested:

| Audience | Auto-Suggested MCPs |
|----------|---------------------|
| Primary (Class 1–5) | Khan Academy, WhatsApp, Google Classroom |
| Middle (Class 6–8) | Khan Academy, YouTube Transcript, Google Classroom, Notion |
| Secondary (Class 9–10) | YouTube Transcript, PDF, Google Classroom, Firecrawl |
| Senior Secondary (11–12) | YouTube Transcript, ArXiv, Telegram, Razorpay |
| Undergraduate | GitHub, Moodle, Semantic Scholar, Chroma, Slack |
| Post-Graduate / Research | ArXiv, Scientific Papers, PubMed, Semantic Scholar, Cognee, Qdrant |
| Competitive (JEE/NEET/UPSC/CAT/GATE) | YouTube Transcript, Firecrawl, Telegram, WhatsApp, Chroma |

---

## Build Priority

Build these wrappers in this order (highest impact first):

1. **WhatsApp Business** — #1 parent communication channel in India. Use MSG91 or Gupshup as gateway.
2. **IndicTrans2 / AI4Bharat** — 22 Indian languages. Free API. Differentiator vs global EdTech.
3. **Moodle** — Dominant LMS in Indian engineering colleges. REST API is well-documented.
4. **Razorpay** — Fee gating for paid courses. Simple webhook-based integration.
5. **Bhashini (ULCA)** — Free government translation API. Covers all scheduled languages.

---

## Adding an MCP to an Agent

In the builder UI, drag an MCP connector from the palette onto an agent node.
Or add it directly to the agent's YAML config:

```yaml
mcps:
  - name: youtube-transcript
    transport: stdio
    command: npx -y kimtaeyoon83/mcp-server-youtube-transcript
    env: {}

  - name: google-classroom
    transport: stdio
    command: npx -y faizan45640/google-classroom-mcp
    env:
      GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID}"
      GOOGLE_CLIENT_SECRET: "${GOOGLE_CLIENT_SECRET}"
      GOOGLE_REFRESH_TOKEN: "${GOOGLE_REFRESH_TOKEN}"
```

All env vars use `${VAR_NAME}` syntax — values come from the generated `.env` file.
