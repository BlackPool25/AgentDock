import { logger } from "../logger.js";

export async function extractPdfText(base64Content: string): Promise<string> {
  try {
    const { spawn } = await import("child_process");
    const pythonScript = `
import sys, base64, tempfile, os
try:
    from pdfminer.high_level import extract_text
    data = base64.b64decode(sys.stdin.read())
    f = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
    f.write(data)
    f.close()
    print(extract_text(f.name))
    os.unlink(f.name)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
`;
    return new Promise((resolve, reject) => {
      const proc = spawn("python3", ["-c", pythonScript], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.stderr.on("data", (d) => { stderr += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          logger.warn({ stderr }, "PDF extraction failed");
          resolve("");
        }
      });
      proc.stdin.write(base64Content);
      proc.stdin.end();
    });
  } catch (err) {
    logger.warn({ err: String(err) }, "PDF extraction failed, returning empty text");
    return "";
  }
}
