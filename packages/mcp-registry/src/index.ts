// AgentDock MCP Registry
// All 52 MCPs available for EdTech pipelines — tiers, status, audience mappings

export type MCPTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type MCPStatus = "default" | "optional" | "advanced";
export type AudienceLevel =
  | "primary"       // Class 1–5
  | "middle"        // Class 6–8
  | "secondary"     // Class 9–10
  | "senior"        // Class 11–12
  | "undergraduate"
  | "postgraduate"
  | "competitive";  // JEE/NEET/UPSC/CAT/GATE

export interface MCPEntry {
  id: string;
  name: string;
  description: string;
  tier: MCPTier;
  status: MCPStatus;
  /** npm package or repo slug */
  package: string;
  /** "connect" = use existing MCP as-is | "build" = need to wrap an API */
  action: "connect" | "build";
  /** audiences that get this auto-suggested */
  audiences: AudienceLevel[];
  /** env vars the user must supply */
  requiredEnv: string[];
  transport: "stdio" | "sse" | "streamable-http";
}

export const MCP_REGISTRY: MCPEntry[] = [
  // ── TIER 1: CORE INFRASTRUCTURE ──────────────────────────────────────────
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Read/write local files — curriculum PDFs, student data exports, generated reports",
    tier: 1, status: "default", action: "connect",
    package: "@modelcontextprotocol/server-filesystem",
    audiences: ["primary","middle","secondary","senior","undergraduate","postgraduate","competitive"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Primary student data store — profiles, progress, assessments, gap maps",
    tier: 1, status: "default", action: "connect",
    package: "@modelcontextprotocol/server-postgres",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["POSTGRES_URL"], transport: "stdio",
  },
  {
    id: "redis",
    name: "Redis",
    description: "Agent memory, session state, pub/sub message bus, queue management",
    tier: 1, status: "default", action: "connect",
    package: "@modelcontextprotocol/server-redis",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["REDIS_URL"], transport: "stdio",
  },
  {
    id: "sqlite",
    name: "SQLite",
    description: "Lightweight local DB for builder config, design storage, offline-first scenarios",
    tier: 1, status: "default", action: "connect",
    package: "@modelcontextprotocol/server-sqlite",
    audiences: ["primary","middle","secondary","senior","undergraduate","postgraduate","competitive"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "memory-kg",
    name: "Memory (Knowledge Graph)",
    description: "Persistent agent memory across sessions — student profiles, teacher preferences",
    tier: 1, status: "default", action: "connect",
    package: "@modelcontextprotocol/server-memory",
    audiences: ["primary","middle","secondary","senior","undergraduate","postgraduate","competitive"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "brave-search",
    name: "Web Search (Brave)",
    description: "Live web search for agents that need current information",
    tier: 1, status: "default", action: "connect",
    package: "@modelcontextprotocol/server-brave-search",
    audiences: ["secondary","senior","undergraduate","postgraduate","competitive"],
    requiredEnv: ["BRAVE_API_KEY"], transport: "stdio",
  },
  {
    id: "web-fetch",
    name: "Web Fetch",
    description: "Fetch and parse any URL — syllabus pages, NCERT chapters, university sites",
    tier: 1, status: "default", action: "connect",
    package: "@modelcontextprotocol/server-fetch",
    audiences: ["primary","middle","secondary","senior","undergraduate","postgraduate","competitive"],
    requiredEnv: [], transport: "stdio",
  },

  // ── TIER 2: EDUCATION PLATFORM ────────────────────────────────────────────
  {
    id: "google-classroom",
    name: "Google Classroom",
    description: "Fetch courses, rosters, assignments, grades; push feedback and announcements",
    tier: 2, status: "default", action: "connect",
    package: "faizan45640/google-classroom-mcp",
    audiences: ["primary","middle","secondary","senior","undergraduate"],
    requiredEnv: ["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REFRESH_TOKEN"], transport: "stdio",
  },
  {
    id: "youtube-transcript",
    name: "YouTube Transcript",
    description: "Extract transcripts from lecture videos — supports yt-dlp + Whisper fallback for Hindi/regional audio",
    tier: 2, status: "default", action: "connect",
    package: "kimtaeyoon83/mcp-server-youtube-transcript",
    audiences: ["middle","secondary","senior","undergraduate","postgraduate","competitive"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Read teacher-uploaded content, curriculum docs, question banks",
    tier: 2, status: "default", action: "connect",
    package: "google-drive-mcp",
    audiences: ["primary","middle","secondary","senior","undergraduate","postgraduate"],
    requiredEnv: ["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REFRESH_TOKEN"], transport: "stdio",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Teacher knowledge bases, lesson plan repositories, faculty wikis",
    tier: 2, status: "optional", action: "connect",
    package: "makenotion/notion-mcp-server",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["NOTION_API_KEY"], transport: "stdio",
  },
  {
    id: "moodle",
    name: "Moodle",
    description: "Full LMS integration — courses, quizzes, gradebook, forums (huge in Indian colleges)",
    tier: 2, status: "optional", action: "build",
    package: "agentdock/mcp-server-moodle",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["MOODLE_URL","MOODLE_TOKEN"], transport: "streamable-http",
  },
  {
    id: "khan-academy",
    name: "Khan Academy",
    description: "Free curriculum content for K–12 — topic trees, video transcripts, exercises",
    tier: 2, status: "optional", action: "connect",
    package: "khan-academy-mcp",
    audiences: ["primary","middle","secondary","senior"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "udemy-business",
    name: "Udemy Business",
    description: "Course catalog for upskilling/professional tracks (PG + corporate learners)",
    tier: 2, status: "optional", action: "connect",
    package: "udemy-business-mcp",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["UDEMY_CLIENT_ID","UDEMY_CLIENT_SECRET"], transport: "stdio",
  },
  {
    id: "canvas-lms",
    name: "Canvas LMS",
    description: "Popular in Indian engineering colleges and international schools",
    tier: 2, status: "optional", action: "connect",
    package: "canvas-lms-mcp",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["CANVAS_URL","CANVAS_TOKEN"], transport: "stdio",
  },
  {
    id: "github",
    name: "GitHub",
    description: "CS/engineering student project submissions, code reviews, assignment repos",
    tier: 2, status: "optional", action: "connect",
    package: "@modelcontextprotocol/server-github",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["GITHUB_TOKEN"], transport: "stdio",
  },

  // ── TIER 3: RESEARCH & ACADEMIC ───────────────────────────────────────────
  {
    id: "arxiv",
    name: "ArXiv",
    description: "Search and retrieve research papers — essential for PG/research students",
    tier: 3, status: "default", action: "connect",
    package: "blazickjp/arxiv-mcp-server",
    audiences: ["postgraduate"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "scientific-papers",
    name: "Scientific Papers Multi-Source",
    description: "arXiv + OpenAlex + PubMed Central + bioRxiv + CORE in one MCP",
    tier: 3, status: "optional", action: "connect",
    package: "benedict2310/Scientific-Papers-MCP",
    audiences: ["postgraduate"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "pubmed",
    name: "PubMed",
    description: "Medical/life sciences literature — MBBS, pharmacy, biotech students",
    tier: 3, status: "optional", action: "connect",
    package: "SimplePubMed",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "semantic-scholar",
    name: "Semantic Scholar",
    description: "Citation graphs, paper recommendations, author networks",
    tier: 3, status: "optional", action: "build",
    package: "agentdock/mcp-server-semantic-scholar",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["SEMANTIC_SCHOLAR_API_KEY"], transport: "streamable-http",
  },
  {
    id: "google-scholar",
    name: "Google Scholar",
    description: "Broad academic search (scraper-based — use carefully)",
    tier: 3, status: "advanced", action: "build",
    package: "agentdock/mcp-server-google-scholar",
    audiences: ["postgraduate"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "shodhganga",
    name: "Shodhganga / JSTOR",
    description: "Indian thesis repository — 500K+ Indian doctoral theses",
    tier: 3, status: "advanced", action: "build",
    package: "agentdock/mcp-server-shodhganga",
    audiences: ["postgraduate"],
    requiredEnv: [], transport: "stdio",
  },

  // ── TIER 4: COMMUNICATION ─────────────────────────────────────────────────
  {
    id: "gmail",
    name: "Gmail",
    description: "Teacher-to-parent emails, automated progress reports, doubt resolution threads",
    tier: 4, status: "default", action: "connect",
    package: "google-gmail-mcp",
    audiences: ["primary","middle","secondary","senior","undergraduate","postgraduate"],
    requiredEnv: ["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REFRESH_TOKEN"], transport: "stdio",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Schedule study sessions, exam reminders, parent-teacher meetings",
    tier: 4, status: "default", action: "connect",
    package: "google-calendar-mcp",
    audiences: ["primary","middle","secondary","senior","undergraduate","postgraduate","competitive"],
    requiredEnv: ["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REFRESH_TOKEN"], transport: "stdio",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Internal team comms — teacher collaboration, admin alerts, EdTech team workflows",
    tier: 4, status: "optional", action: "connect",
    package: "@modelcontextprotocol/server-slack",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["SLACK_BOT_TOKEN"], transport: "stdio",
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    description: "Parent notifications, student reminders — #1 communication channel in India",
    tier: 4, status: "optional", action: "build",
    package: "agentdock/mcp-server-whatsapp",
    audiences: ["primary","middle","secondary","senior","competitive"],
    requiredEnv: ["WHATSAPP_API_KEY","WHATSAPP_PHONE_ID"], transport: "streamable-http",
  },
  {
    id: "twilio-sms",
    name: "Twilio SMS",
    description: "SMS fallback for low-smartphone parents, OTP, critical alerts",
    tier: 4, status: "optional", action: "connect",
    package: "twilio-mcp",
    audiences: ["primary","middle","secondary"],
    requiredEnv: ["TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN","TWILIO_FROM_NUMBER"], transport: "stdio",
  },
  {
    id: "ms-teams",
    name: "Microsoft Teams",
    description: "Corporate/university deployments using Microsoft 365",
    tier: 4, status: "optional", action: "connect",
    package: "microsoft-365-mcp",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["MS_TENANT_ID","MS_CLIENT_ID","MS_CLIENT_SECRET"], transport: "stdio",
  },
  {
    id: "telegram",
    name: "Telegram Bot",
    description: "Student doubt groups, study pods, tutor bots — popular in India for JEE/NEET groups",
    tier: 4, status: "optional", action: "connect",
    package: "telegram-mcp",
    audiences: ["secondary","senior","competitive"],
    requiredEnv: ["TELEGRAM_BOT_TOKEN"], transport: "stdio",
  },

  // ── TIER 5: PRODUCTIVITY & CONTENT ────────────────────────────────────────
  {
    id: "google-docs",
    name: "Google Docs",
    description: "Generate lesson plans, worksheets, reports as shareable Google Docs",
    tier: 5, status: "default", action: "connect",
    package: "google-workspace-mcp",
    audiences: ["primary","middle","secondary","senior","undergraduate","postgraduate"],
    requiredEnv: ["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REFRESH_TOKEN"], transport: "stdio",
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Student grade tracking, batch analytics, attendance sheets",
    tier: 5, status: "default", action: "connect",
    package: "google-workspace-mcp",
    audiences: ["primary","middle","secondary","senior","undergraduate","postgraduate"],
    requiredEnv: ["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REFRESH_TOKEN"], transport: "stdio",
  },
  {
    id: "google-slides",
    name: "Google Slides",
    description: "Auto-generate presentation decks from lesson content",
    tier: 5, status: "optional", action: "connect",
    package: "google-workspace-mcp",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REFRESH_TOKEN"], transport: "stdio",
  },
  {
    id: "pdf",
    name: "PDF Reader/Writer",
    description: "Parse uploaded syllabus PDFs, question papers, textbook chapters",
    tier: 5, status: "default", action: "connect",
    package: "@modelcontextprotocol/server-filesystem",
    audiences: ["primary","middle","secondary","senior","undergraduate","postgraduate","competitive"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "puppeteer",
    name: "Puppeteer/Playwright",
    description: "Web scraping — CBSE circular pages, university notices, exam date sheets",
    tier: 5, status: "optional", action: "connect",
    package: "@modelcontextprotocol/server-puppeteer",
    audiences: ["secondary","senior","competitive"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    description: "Clean structured web scraping for syllabus pages, news, announcements",
    tier: 5, status: "optional", action: "connect",
    package: "firecrawl-mcp",
    audiences: ["secondary","senior","undergraduate","competitive"],
    requiredEnv: ["FIRECRAWL_API_KEY"], transport: "stdio",
  },

  // ── TIER 6: DEVELOPER & AGENT INFRA ──────────────────────────────────────
  {
    id: "docker",
    name: "Docker",
    description: "Manage generated runtime containers, inspect running agents, hot-reload",
    tier: 6, status: "default", action: "connect",
    package: "@modelcontextprotocol/server-docker",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "git",
    name: "Git",
    description: "Version control for agent config files, workflow yamls, generated projects",
    tier: 6, status: "default", action: "connect",
    package: "@modelcontextprotocol/server-git",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Error tracking for agent failures, crash reports, timeout alerts",
    tier: 6, status: "optional", action: "connect",
    package: "@modelcontextprotocol/server-sentry",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["SENTRY_DSN"], transport: "stdio",
  },
  {
    id: "context7",
    name: "Context7",
    description: "Up-to-date code documentation for LLMs — critical when agents write/debug code",
    tier: 6, status: "optional", action: "connect",
    package: "upstash/context7",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "Forces structured step-by-step reasoning in complex multi-hop problems",
    tier: 6, status: "default", action: "connect",
    package: "@modelcontextprotocol/server-sequential-thinking",
    audiences: ["secondary","senior","undergraduate","postgraduate","competitive"],
    requiredEnv: [], transport: "stdio",
  },

  // ── TIER 7: INDIAN PAYMENT & IDENTITY ────────────────────────────────────
  {
    id: "razorpay",
    name: "Razorpay",
    description: "Fee collection status, subscription gating, payment webhook context",
    tier: 7, status: "optional", action: "build",
    package: "agentdock/mcp-server-razorpay",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["RAZORPAY_KEY_ID","RAZORPAY_KEY_SECRET"], transport: "streamable-http",
  },
  {
    id: "digilocker",
    name: "DigiLocker",
    description: "Student credential verification — Aadhaar-linked mark sheets, certificates",
    tier: 7, status: "advanced", action: "build",
    package: "agentdock/mcp-server-digilocker",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["DIGILOCKER_CLIENT_ID","DIGILOCKER_CLIENT_SECRET"], transport: "streamable-http",
  },
  {
    id: "upi-status",
    name: "NPCI / UPI Status",
    description: "Payment confirmation for fee workflows (webhooks)",
    tier: 7, status: "advanced", action: "build",
    package: "agentdock/mcp-server-upi",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["UPI_MERCHANT_ID","UPI_API_KEY"], transport: "streamable-http",
  },
  {
    id: "aadhaar-ekyc",
    name: "Aadhaar eKYC",
    description: "Student identity verification for exam registrations, admissions",
    tier: 7, status: "advanced", action: "build",
    package: "agentdock/mcp-server-aadhaar",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["UIDAI_CLIENT_ID","UIDAI_CLIENT_SECRET"], transport: "streamable-http",
  },

  // ── TIER 8: LANGUAGE & AI ─────────────────────────────────────────────────
  {
    id: "indictrans2",
    name: "IndicTrans2 / AI4Bharat",
    description: "State-of-the-art translation for 22 Indian languages — Indic-to-Indic + English",
    tier: 8, status: "default", action: "build",
    package: "agentdock/mcp-server-indictrans2",
    audiences: ["primary","middle","secondary","senior","undergraduate","postgraduate","competitive"],
    requiredEnv: ["AI4BHARAT_API_KEY"], transport: "streamable-http",
  },
  {
    id: "sarvam",
    name: "Sarvam AI",
    description: "Indian-language STT + TTS — voice doubt resolution in Hindi/regional",
    tier: 8, status: "optional", action: "build",
    package: "agentdock/mcp-server-sarvam",
    audiences: ["primary","middle","secondary","competitive"],
    requiredEnv: ["SARVAM_API_KEY"], transport: "streamable-http",
  },
  {
    id: "bhashini",
    name: "Bhashini (ULCA)",
    description: "Govt of India's language translation API — free, covers all scheduled languages",
    tier: 8, status: "optional", action: "build",
    package: "agentdock/mcp-server-bhashini",
    audiences: ["primary","middle","secondary","senior"],
    requiredEnv: ["BHASHINI_USER_ID","BHASHINI_API_KEY"], transport: "streamable-http",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs TTS",
    description: "High-quality text-to-speech for generated explanations and audio lessons",
    tier: 8, status: "optional", action: "connect",
    package: "elevenlabs-mcp",
    audiences: ["primary","middle","secondary"],
    requiredEnv: ["ELEVENLABS_API_KEY"], transport: "stdio",
  },

  // ── TIER 9: VECTOR STORE & RAG ────────────────────────────────────────────
  {
    id: "chroma",
    name: "Chroma",
    description: "Embedded vector store — local RAG for curriculum content, no cloud dependency",
    tier: 9, status: "default", action: "connect",
    package: "chroma-mcp",
    audiences: ["secondary","senior","undergraduate","postgraduate","competitive"],
    requiredEnv: [], transport: "stdio",
  },
  {
    id: "qdrant",
    name: "Qdrant",
    description: "Production-scale vector search — for large deployments (50K+ students)",
    tier: 9, status: "optional", action: "connect",
    package: "qdrant-mcp",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["QDRANT_URL","QDRANT_API_KEY"], transport: "stdio",
  },
  {
    id: "cognee",
    name: "Cognee (Knowledge Graph)",
    description: "Memory manager with Hebbian learning + graph stores — persistent student models",
    tier: 9, status: "optional", action: "connect",
    package: "topoteretes/cognee",
    audiences: ["undergraduate","postgraduate"],
    requiredEnv: ["COGNEE_API_KEY"], transport: "stdio",
  },
  {
    id: "aperag",
    name: "ApeRAG",
    description: "Graph RAG + vector search + full-text search combined — production RAG platform",
    tier: 9, status: "advanced", action: "connect",
    package: "apecloud/ApeRAG",
    audiences: ["postgraduate"],
    requiredEnv: ["APERAG_API_KEY"], transport: "streamable-http",
  },
];

/** The 15 MCPs that ship pre-wired in every new AgentDock project */
export const DEFAULT_BUNDLE: string[] = [
  "filesystem", "postgres", "redis", "memory-kg", "sequential-thinking",
  "web-fetch", "brave-search", "youtube-transcript", "pdf",
  "google-classroom", "google-drive", "google-docs", "google-sheets",
  "indictrans2",
  "gmail",
  "docker", "git",
];

/** MCPs auto-suggested when user selects an audience level */
export const AUDIENCE_AUTO_SUGGEST: Record<AudienceLevel, string[]> = {
  primary:       ["khan-academy", "whatsapp", "google-classroom"],
  middle:        ["khan-academy", "youtube-transcript", "google-classroom", "notion"],
  secondary:     ["youtube-transcript", "pdf", "google-classroom", "firecrawl"],
  senior:        ["youtube-transcript", "arxiv", "telegram", "razorpay"],
  undergraduate: ["github", "moodle", "semantic-scholar", "chroma", "slack"],
  postgraduate:  ["arxiv", "scientific-papers", "pubmed", "semantic-scholar", "cognee", "qdrant"],
  competitive:   ["youtube-transcript", "firecrawl", "telegram", "whatsapp", "chroma"],
};

/** Look up a single MCP by id */
export function getMCP(id: string): MCPEntry | undefined {
  return MCP_REGISTRY.find((m) => m.id === id);
}

/** Get all MCPs for a given audience level (default + auto-suggested) */
export function getMCPsForAudience(audience: AudienceLevel): MCPEntry[] {
  const ids = new Set([...DEFAULT_BUNDLE, ...(AUDIENCE_AUTO_SUGGEST[audience] ?? [])]);
  return MCP_REGISTRY.filter((m) => ids.has(m.id));
}

/** Get all default-bundle MCPs as MCPConfig entries (for agent YAML generation) */
export function getDefaultMCPConfigs() {
  return MCP_REGISTRY
    .filter((m) => DEFAULT_BUNDLE.includes(m.id))
    .map((m) => ({
      name: m.id,
      transport: m.transport,
      package: m.package,
      requiredEnv: m.requiredEnv,
    }));
}
