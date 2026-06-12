import archiver from "archiver";
import { createWriteStream, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import type { SystemDesign, SeedFile } from "@agentdock/config-schema";
import { generateCompose } from "./compose-gen.js";
import { generateAgentConfig } from "./agent-config-gen.js";
import { generateWorkflow } from "./workflow-gen.js";
import { generateEnvExample } from "./env-gen.js";
import { generateReadme } from "./readme-gen.js";
import { extractPdfText } from "./pdf-extract.js";
import { logger } from "../logger.js";

const APPS_DIR = resolve(process.env.APPS_DIR ?? join(import.meta.dir, "../../../.."));
const TEMPLATE_DIR = resolve(process.env.TEMPLATE_DIR ?? join(import.meta.dir, "../../../../template"));
const OUTPUT_DIR = resolve(process.env.OUTPUT_DIR ?? "./data/generated");

// Runtime source directories — apps/ is the single source of truth
const RUNTIME_DIRS = {
  orchestrator: join(APPS_DIR, "orchestrator"),
  "llm-gateway": join(APPS_DIR, "llm-gateway"),
  "agent-runtime": join(APPS_DIR, "agent-runtime"),
};

export async function generateProject(design: SystemDesign, generationId: string): Promise<string> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const zipPath = join(OUTPUT_DIR, `${generationId}.zip`);
  const projectName = design.systemName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  const preparedSeedFiles: Array<{ agentId: string; files: Array<{ filename: string; content: string; extractedText?: string; isPdf: boolean }> }> = [];

  for (const agent of design.agents) {
    const seedFiles: SeedFile[] = (agent as any).seedFiles || [];
    if (seedFiles.length > 0) {
      const agentSeedFiles: Array<{ filename: string; content: string; extractedText?: string; isPdf: boolean }> = [];
      for (const sf of seedFiles) {
        let extractedText = sf.extractedText;
        if (sf.type === "pdf" && !extractedText) {
          extractedText = await extractPdfText(sf.content);
        }
        agentSeedFiles.push({
          filename: sf.filename,
          content: sf.content,
          extractedText,
          isPdf: sf.type === "pdf",
        });
      }
      preparedSeedFiles.push({ agentId: agent.id, files: agentSeedFiles });
    }
  }

  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 6 } });

    output.on("close", () => {
      logger.info({ zipPath, bytes: archive.pointer() }, "Project zip created");
      resolve(zipPath);
    });
    archive.on("error", reject);
    archive.pipe(output);

    const prefix = `${projectName}-system`;

    // ── Generated config files ─────────────────────────────────────────────────
    archive.append(generateCompose(design), { name: `${prefix}/docker-compose.yml` });
    archive.append(generateWorkflow(design), { name: `${prefix}/configs/workflow.yaml` });
    archive.append(generateEnvExample(design), { name: `${prefix}/.env.example` });
    archive.append(generateReadme(design), { name: `${prefix}/README.md` });

    for (const agent of design.agents) {
      archive.append(generateAgentConfig(agent), {
        name: `${prefix}/configs/agents/${agent.id}.yaml`,
      });
    }

    for (const { agentId, files } of preparedSeedFiles) {
      const seedDir = `${prefix}/configs/seed/${agentId}`;
      for (const sf of files) {
        if (sf.isPdf) {
          archive.append(Buffer.from(sf.content, "base64"), { name: `${seedDir}/${sf.filename}` });
        } else {
          archive.append(sf.content, { name: `${seedDir}/${sf.filename}` });
        }
        if (sf.extractedText) {
          archive.append(sf.extractedText, { name: `${seedDir}/${sf.filename}.extracted.txt` });
        }
      }
    }

    // ── Runtime source (apps/ is the single source of truth) ───────────────────
    // Only include files needed by the generated runtime (excludes builder-only files)
    const runtimeFiles: Array<[string, string]> = [
      // Orchestrator
      [join(APPS_DIR, "orchestrator/package.json"), `${prefix}/orchestrator/package.json`],
      [join(APPS_DIR, "orchestrator/tsconfig.json"), `${prefix}/orchestrator/tsconfig.json`],
      [join(TEMPLATE_DIR, "orchestrator/Dockerfile"), `${prefix}/orchestrator/Dockerfile`],
      [join(APPS_DIR, "orchestrator/src/index.ts"), `${prefix}/orchestrator/src/index.ts`],
      [join(APPS_DIR, "orchestrator/src/logger.ts"), `${prefix}/orchestrator/src/logger.ts`],
      [join(APPS_DIR, "orchestrator/src/config/env.ts"), `${prefix}/orchestrator/src/config/env.ts`],
      [join(APPS_DIR, "orchestrator/src/config/loader.ts"), `${prefix}/orchestrator/src/config/loader.ts`],
      [join(APPS_DIR, "orchestrator/src/auth/jwt.ts"), `${prefix}/orchestrator/src/auth/jwt.ts`],
      [join(APPS_DIR, "orchestrator/src/workflow/parser.ts"), `${prefix}/orchestrator/src/workflow/parser.ts`],
      [join(APPS_DIR, "orchestrator/src/trigger/manager.ts"), `${prefix}/orchestrator/src/trigger/manager.ts`],
      [join(APPS_DIR, "orchestrator/src/api/routes/agents.ts"), `${prefix}/orchestrator/src/api/routes/agents.ts`],
      [join(APPS_DIR, "orchestrator/src/api/routes/system.ts"), `${prefix}/orchestrator/src/api/routes/system.ts`],
      [join(APPS_DIR, "orchestrator/src/api/routes/webhooks.ts"), `${prefix}/orchestrator/src/api/routes/webhooks.ts`],
      [join(APPS_DIR, "orchestrator/src/api/websocket/hub.ts"), `${prefix}/orchestrator/src/api/websocket/hub.ts`],
      [join(APPS_DIR, "orchestrator/src/proxy/agent-proxy.ts"), `${prefix}/orchestrator/src/proxy/agent-proxy.ts`],
      [join(APPS_DIR, "orchestrator/src/docker/agent-manager.ts"), `${prefix}/orchestrator/src/docker/agent-manager.ts`],
      [join(APPS_DIR, "orchestrator/src/docker/container-manager.ts"), `${prefix}/orchestrator/src/docker/container-manager.ts`],
      [join(APPS_DIR, "orchestrator/src/docker/network-manager.ts"), `${prefix}/orchestrator/src/docker/network-manager.ts`],
      [join(APPS_DIR, "orchestrator/src/docker/client.ts"), `${prefix}/orchestrator/src/docker/client.ts`],
      // LLM Gateway
      [join(APPS_DIR, "llm-gateway/package.json"), `${prefix}/llm-gateway/package.json`],
      [join(APPS_DIR, "llm-gateway/tsconfig.json"), `${prefix}/llm-gateway/tsconfig.json`],
      [join(TEMPLATE_DIR, "llm-gateway/Dockerfile"), `${prefix}/llm-gateway/Dockerfile`],
      [join(APPS_DIR, "llm-gateway/src/index.ts"), `${prefix}/llm-gateway/src/index.ts`],
      [join(APPS_DIR, "llm-gateway/src/logger.ts"), `${prefix}/llm-gateway/src/logger.ts`],
      [join(APPS_DIR, "llm-gateway/src/types.ts"), `${prefix}/llm-gateway/src/types.ts`],
      [join(APPS_DIR, "llm-gateway/src/api/routes/chat.ts"), `${prefix}/llm-gateway/src/api/routes/chat.ts`],
      [join(APPS_DIR, "llm-gateway/src/api/routes/health.ts"), `${prefix}/llm-gateway/src/api/routes/health.ts`],
      [join(APPS_DIR, "llm-gateway/src/api/routes/providers.ts"), `${prefix}/llm-gateway/src/api/routes/providers.ts`],
      [join(APPS_DIR, "llm-gateway/src/api/routes/queue.ts"), `${prefix}/llm-gateway/src/api/routes/queue.ts`],
      [join(APPS_DIR, "llm-gateway/src/loadbalancer/ollama-lb.ts"), `${prefix}/llm-gateway/src/loadbalancer/ollama-lb.ts`],
      [join(APPS_DIR, "llm-gateway/src/providers/base.ts"), `${prefix}/llm-gateway/src/providers/base.ts`],
      [join(APPS_DIR, "llm-gateway/src/providers/openai.ts"), `${prefix}/llm-gateway/src/providers/openai.ts`],
      [join(APPS_DIR, "llm-gateway/src/providers/anthropic.ts"), `${prefix}/llm-gateway/src/providers/anthropic.ts`],
      [join(APPS_DIR, "llm-gateway/src/providers/gemini.ts"), `${prefix}/llm-gateway/src/providers/gemini.ts`],
      [join(APPS_DIR, "llm-gateway/src/providers/groq.ts"), `${prefix}/llm-gateway/src/providers/groq.ts`],
      [join(APPS_DIR, "llm-gateway/src/providers/ollama.ts"), `${prefix}/llm-gateway/src/providers/ollama.ts`],
      [join(APPS_DIR, "llm-gateway/src/providers/registry.ts"), `${prefix}/llm-gateway/src/providers/registry.ts`],
      [join(APPS_DIR, "llm-gateway/src/queue/producer.ts"), `${prefix}/llm-gateway/src/queue/producer.ts`],
      [join(APPS_DIR, "llm-gateway/src/queue/worker.ts"), `${prefix}/llm-gateway/src/queue/worker.ts`],
      // Agent Runtime
      [join(APPS_DIR, "agent-runtime/pyproject.toml"), `${prefix}/agent-runtime/pyproject.toml`],
    ];
    for (const [src, dest] of runtimeFiles) {
      if (existsSync(src)) {
        archive.file(src, { name: dest });
      } else {
        logger.warn({ src }, "Runtime file not found — skipping");
      }
    }

    // Copy agent-runtime/app/ directory (entire Python app)
    const agentAppDir = join(APPS_DIR, "agent-runtime/app");
    if (existsSync(agentAppDir)) {
      archive.directory(agentAppDir, `${prefix}/agent-runtime/app`);
    }

    // Agent Dockerfile from template
    const agentDockerfile = join(TEMPLATE_DIR, "agent-base.Dockerfile");
    if (existsSync(agentDockerfile)) {
      archive.file(agentDockerfile, { name: `${prefix}/agent-runtime/Dockerfile` });
    }

    // Console UI (Vite + React dashboard)
    const consoleDir = join(APPS_DIR, "apps/runtime-console");
    if (existsSync(consoleDir)) {
      archive.directory(consoleDir, `${prefix}/console`, (entry) => {
        const name = entry.name || "";
        if (name.includes("node_modules") || name.includes("dist") || name.endsWith(".zip")) {
          return false;
        }
        return entry;
      });
    }

    archive.finalize();
  });
}
