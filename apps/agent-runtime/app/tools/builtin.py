"""
AgentDock Builtin Tools
=====================
These tools are available to every agent without any MCP configuration.
They cover the 80% case: fetch content from the web, run code, search.

Pain point addressed: Students paste a YouTube link or a PDF URL and expect
the agent to read it. Without fetch_url, the agent can only work with text
typed directly into the chat — useless for real learning workflows.
"""
from __future__ import annotations

import asyncio
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path
from typing import Optional

import httpx
import structlog

log = structlog.get_logger()

# ── fetch_url ─────────────────────────────────────────────────────────────────

async def fetch_url(url: str, max_chars: int = 8000) -> str:
    """
    Fetch and extract readable text from a URL.

    Supports:
    - Web pages (HTML stripped via trafilatura)
    - Direct PDF links (text extracted via pypdf)
    - YouTube URLs (transcript via youtube-transcript-api)

    Returns plain text, truncated to max_chars.
    """
    url = url.strip()

    # YouTube
    if "youtube.com/watch" in url or "youtu.be/" in url:
        return await _fetch_youtube_transcript(url, max_chars)

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        try:
            resp = await client.get(url, headers={"User-Agent": "AgentDock/1.0"})
            resp.raise_for_status()
        except Exception as e:
            return f"[fetch_url error] Could not fetch {url}: {e}"

        content_type = resp.headers.get("content-type", "")

        if "pdf" in content_type or url.lower().endswith(".pdf"):
            return _extract_pdf_bytes(resp.content, max_chars)

        # HTML — use trafilatura if available, else strip tags manually
        return _extract_html(resp.text, url, max_chars)


def _extract_html(html: str, url: str, max_chars: int) -> str:
    try:
        import trafilatura  # type: ignore
        text = trafilatura.extract(html, include_links=False, include_images=False)
        if text:
            return text[:max_chars]
    except ImportError:
        pass
    # Fallback: strip tags
    import re
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def _extract_pdf_bytes(data: bytes, max_chars: int) -> str:
    try:
        import io
        from pypdf import PdfReader  # type: ignore
        reader = PdfReader(io.BytesIO(data))
        pages = [p.extract_text() or "" for p in reader.pages]
        text = "\n".join(pages).strip()
        return text[:max_chars] if text else "[PDF had no extractable text]"
    except Exception as e:
        return f"[PDF extraction error] {e}"


async def _fetch_youtube_transcript(url: str, max_chars: int) -> str:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore
        import re
        video_id_match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", url)
        if not video_id_match:
            return f"[fetch_url error] Could not extract video ID from {url}"
        video_id = video_id_match.group(1)
        # Try English first, then any available language
        try:
            transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])
        except Exception:
            transcript = YouTubeTranscriptApi.get_transcript(video_id)
        text = " ".join(entry["text"] for entry in transcript)
        return text[:max_chars]
    except Exception as e:
        return f"[YouTube transcript error] {e}"


# ── run_code ──────────────────────────────────────────────────────────────────

async def run_code(code: str, language: str = "python", timeout: int = 10) -> str:
    """
    Execute code in a sandboxed subprocess and return stdout + stderr.

    Supports: python, javascript (node), bash
    Timeout: 10 seconds (hard limit — prevents infinite loops)

    Pain point: A Teacher Agent that can run code examples live is not a
    chatbot. Students learn better when they see actual output, not just
    descriptions of what the output would be.
    """
    language = language.lower().strip()

    if language in ("python", "py"):
        return await _run_python(code, timeout)
    elif language in ("javascript", "js", "node"):
        return await _run_node(code, timeout)
    elif language in ("bash", "sh", "shell"):
        return await _run_bash(code, timeout)
    else:
        return f"[run_code] Unsupported language: {language}. Supported: python, javascript, bash"


async def _run_python(code: str, timeout: int) -> str:
    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
        f.write(code)
        tmp = f.name
    return await _exec([sys.executable, tmp], timeout, tmp)


async def _run_node(code: str, timeout: int) -> str:
    with tempfile.NamedTemporaryFile(suffix=".js", mode="w", delete=False) as f:
        f.write(code)
        tmp = f.name
    return await _exec(["node", tmp], timeout, tmp)


async def _run_bash(code: str, timeout: int) -> str:
    with tempfile.NamedTemporaryFile(suffix=".sh", mode="w", delete=False) as f:
        f.write(code)
        tmp = f.name
    return await _exec(["bash", tmp], timeout, tmp)


async def _exec(cmd: list[str], timeout: int, tmp_path: str) -> str:
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                # No network access from sandboxed code
                env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/tmp"},
            ),
        )
        output = ""
        if result.stdout:
            output += result.stdout
        if result.stderr:
            output += f"\n[stderr]\n{result.stderr}"
        return output.strip()[:3000] or "[no output]"
    except subprocess.TimeoutExpired:
        return f"[run_code] Timed out after {timeout}s"
    except FileNotFoundError as e:
        return f"[run_code] Runtime not found: {e}"
    except Exception as e:
        return f"[run_code error] {e}"
    finally:
        Path(tmp_path).unlink(missing_ok=True)


# ── search_web ────────────────────────────────────────────────────────────────

async def search_web(query: str, max_results: int = 5) -> str:
    """
    Search the web using DuckDuckGo (no API key required).

    Returns a formatted list of results: title, URL, snippet.
    Falls back to a message if the search fails.

    Pain point: Agents need to find current information — exam dates,
    syllabus updates, CBSE circulars — that isn't in their training data.
    """
    try:
        from duckduckgo_search import DDGS  # type: ignore
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append(f"**{r['title']}**\n{r['href']}\n{r['body']}\n")
        return "\n---\n".join(results) if results else "[search_web] No results found"
    except ImportError:
        return "[search_web] duckduckgo-search not installed. Add it to python_packages."
    except Exception as e:
        return f"[search_web error] {e}"


# ── Tool registry (used by agent_loop.py to expose tools to the LLM) ─────────

BUILTIN_TOOLS = [
    {
        "name": "fetch_url",
        "description": (
            "Fetch and extract readable text from a URL. "
            "Supports web pages, PDFs, and YouTube videos (returns transcript). "
            "Use this whenever the user provides a link to learning material."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The URL to fetch"},
                "max_chars": {"type": "integer", "description": "Max characters to return (default 8000)"},
            },
            "required": ["url"],
        },
        "fn": fetch_url,
    },
    {
        "name": "run_code",
        "description": (
            "Execute code and return the output. "
            "Use this to demonstrate working examples to students. "
            "Supported languages: python, javascript, bash."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "The code to execute"},
                "language": {"type": "string", "description": "python | javascript | bash", "default": "python"},
            },
            "required": ["code"],
        },
        "fn": run_code,
    },
    {
        "name": "search_web",
        "description": (
            "Search the web for current information. "
            "Use for exam dates, syllabus updates, CBSE/university circulars, "
            "or any topic that may have changed after the LLM's training cutoff."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "max_results": {"type": "integer", "description": "Number of results (default 5)"},
            },
            "required": ["query"],
        },
        "fn": search_web,
    },
]


async def call_builtin_tool(name: str, args: dict) -> str:
    """Dispatch a builtin tool call by name. Returns string output."""
    for tool in BUILTIN_TOOLS:
        if tool["name"] == name:
            try:
                result = tool["fn"](**args)
                if asyncio.iscoroutine(result):
                    return await result
                return str(result)
            except Exception as e:
                log.error("builtin_tool_error", tool=name, error=str(e))
                return f"[{name} error] {e}"
    return f"[builtin_tool] Unknown tool: {name}"
