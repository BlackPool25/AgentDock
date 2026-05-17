from __future__ import annotations
import os
import re
from pathlib import Path
import yaml
from .schema import AgentConfig


def _expand_env_vars(text: str) -> str:
    """Replace ${VAR} references with environment variable values."""
    return re.sub(r"\$\{([^}]+)\}", lambda m: os.environ.get(m.group(1), ""), text)


def load_config(path: str = "/app/config/agent.yaml") -> AgentConfig:
    raw = Path(path).read_text()
    expanded = _expand_env_vars(raw)
    data = yaml.safe_load(expanded)
    return AgentConfig.model_validate(data)
