"""
AgentDock Learner Profile Writer
==============================
Maintains a structured learner-profile.md in the Analyzer Agent's memory.

This file is the core of AgentDock's adaptive learning loop:
  1. Analyzer Agent calls update_learner_profile() after scoring a quiz
  2. learner-profile.md is written to /memory (auto-indexed by RAG)
  3. Every subsequent agent query pulls this file as RAG context
  4. Teacher Agent sees "weak on async/await" → adjusts lesson depth
  5. Quiz Agent sees "strong on JSX" → skips basic questions

Pain point addressed: ChatGPT forgets everything after the session ends.
A student who spent 3 sessions learning React has to re-explain their
level every time. learner-profile.md persists across sessions via git.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Optional


PROFILE_FILE = "learner-profile.md"


def build_profile_update(
    topic: str,
    score: int,
    total: int,
    wrong_concepts: list[str],
    correct_concepts: list[str],
    next_topic: Optional[str] = None,
    session_notes: Optional[str] = None,
) -> str:
    """
    Build a structured markdown update for the learner profile.
    The Analyzer Agent calls this after scoring a quiz.

    Returns a markdown string to be written to learner-profile.md.
    The caller (Analyzer Agent) is responsible for reading the existing
    profile, merging this update, and writing the result back.
    """
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pct = round((score / total) * 100) if total > 0 else 0

    lines = [f"## Session Update — {ts}", f"**Topic:** {topic}", f"**Score:** {score}/{total} ({pct}%)"]

    if correct_concepts:
        lines.append(f"**Mastered:** {', '.join(correct_concepts)}")
    if wrong_concepts:
        lines.append(f"**Needs work:** {', '.join(wrong_concepts)}")
    if next_topic:
        lines.append(f"**Next recommended:** {next_topic}")
    if session_notes:
        lines.append(f"**Notes:** {session_notes}")

    return "\n".join(lines)


def merge_profile(existing: str, update: str, topic: str, score: int, total: int,
                  wrong_concepts: list[str], correct_concepts: list[str],
                  next_topic: Optional[str] = None) -> str:
    """
    Merge a quiz result into the existing learner profile markdown.

    Strategy:
    - Append the session update to the history section
    - Update the Strengths section (add concepts with 2+ correct)
    - Update the Weak Areas section (add/remove based on latest score)
    - Update Topics Completed
    - Update Current Topic
    """
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pct = round((score / total) * 100) if total > 0 else 0

    # If no existing profile, create from scratch
    if not existing.strip():
        return _create_fresh_profile(topic, score, total, wrong_concepts, correct_concepts, next_topic, ts)

    # Parse existing sections
    profile = existing

    # Update Weak Areas: add new wrong concepts, remove mastered ones
    for concept in wrong_concepts:
        if concept and f"- {concept}" not in profile:
            profile = _append_to_section(profile, "## Weak Areas", f"- {concept} (missed {ts})")

    # Remove from Weak Areas if now correct
    for concept in correct_concepts:
        profile = re.sub(rf"- {re.escape(concept)}[^\n]*\n?", "", profile)

    # Update Strengths if score >= 80%
    if pct >= 80:
        for concept in correct_concepts:
            if concept and f"- {concept}" not in profile:
                profile = _append_to_section(profile, "## Strengths", f"- {concept} ({ts})")

    # Update Topics Completed
    if pct >= 60 and f"- {topic}" not in profile:
        profile = _append_to_section(profile, "## Topics Completed", f"- {topic} ({pct}%, {ts})")

    # Update Current Topic
    if next_topic:
        profile = re.sub(r"(## Current Topic\n).*?(\n##|\Z)", rf"\1- {next_topic}\n\2", profile, flags=re.DOTALL)

    # Append session history entry
    history_entry = f"\n### {ts} — {topic}\nScore: {score}/{total} ({pct}%)"
    if wrong_concepts:
        history_entry += f"\nMissed: {', '.join(wrong_concepts)}"
    if next_topic:
        history_entry += f"\nNext: {next_topic}"

    profile = _append_to_section(profile, "## Session History", history_entry)

    return profile


def _create_fresh_profile(topic: str, score: int, total: int, wrong: list[str],
                           correct: list[str], next_topic: Optional[str], ts: str) -> str:
    pct = round((score / total) * 100) if total > 0 else 0
    strengths = "\n".join(f"- {c} ({ts})" for c in correct) if pct >= 80 else "(none yet)"
    weak = "\n".join(f"- {c} (missed {ts})" for c in wrong) if wrong else "(none)"
    completed = f"- {topic} ({pct}%, {ts})" if pct >= 60 else "(none yet)"
    current = f"- {next_topic}" if next_topic else f"- {topic}"

    return f"""# Learner Profile

## Strengths
{strengths}

## Weak Areas
{weak}

## Topics Completed
{completed}

## Current Topic
{current}

## Learning Pace
- Sessions completed: 1
- Average score: {pct}%

## Session History

### {ts} — {topic}
Score: {score}/{total} ({pct}%)
{"Missed: " + ", ".join(wrong) if wrong else ""}
{"Next: " + next_topic if next_topic else ""}
"""


def _append_to_section(profile: str, section_header: str, content: str) -> str:
    """Append content under a section header. Creates section if missing."""
    if section_header in profile:
        # Insert after the section header line
        return profile.replace(
            section_header,
            f"{section_header}\n{content}",
            1,
        )
    # Section doesn't exist — append at end
    return profile.rstrip() + f"\n\n{section_header}\n{content}\n"


# ── Prompt template for the Analyzer Agent ────────────────────────────────────
# Inject this into the Analyzer Agent's system prompt / action prompt_template.

ANALYZER_PROMPT_TEMPLATE = """\
You are the Analyzer Agent in an adaptive learning system.

Your job:
1. Read quiz.md to get the correct answers
2. Read the student's answers from the attached file or instruction
3. Score each answer (correct/incorrect)
4. Identify the specific concept each wrong answer reveals a gap in
5. Update learner-profile.md with the results
6. Decide the next topic based on gaps and completed topics
7. Write analysis.md with a friendly summary

When updating learner-profile.md:
- Read the existing file first (use filesystem or memory tools)
- Add wrong concepts to Weak Areas
- Add mastered concepts to Strengths (if score >= 80%)
- Add topic to Topics Completed if score >= 60%
- Update Current Topic to the next recommended topic
- Append a Session History entry

Format analysis.md as:
---
## Quiz Results: {{input.topic}}

**Score: X/Y**

### What you got right ✓
- [concept]: [brief explanation of why it's correct]

### What needs more practice ✗
- [concept]: [specific misconception identified]

### Next up: [next_topic]
[One sentence on why this is the logical next step]

Ready when you are! Type 'continue' to start the next lesson.
---

Write your output to analysis.md.
"""
