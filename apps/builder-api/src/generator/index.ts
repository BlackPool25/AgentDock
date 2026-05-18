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

const TEMPLATE_DIR = resolve(process.env.TEMPLATE_DIR ?? join(import.meta.dir, "../../../../template"));
const OUTPUT_DIR = resolve(process.env.OUTPUT_DIR ?? "./data/generated");

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

    // ── Template source (copied verbatim) ──────────────────────────────────────
    const templateDirs = ["orchestrator", "llm-gateway", "agent-runtime"];
    for (const dir of templateDirs) {
      const dirPath = join(TEMPLATE_DIR, dir);
      if (existsSync(dirPath)) {
        archive.directory(dirPath, `${prefix}/${dir}`);
      } else {
        logger.warn({ dir: dirPath }, "Template directory not found — skipping");
      }
    }

    // agent-base.Dockerfile → agent-runtime/Dockerfile in generated project
    const agentDockerfile = join(TEMPLATE_DIR, "agent-base.Dockerfile");
    if (existsSync(agentDockerfile)) {
      archive.file(agentDockerfile, { name: `${prefix}/agent-runtime/Dockerfile` });
    }

    archive.finalize();
  });
}
