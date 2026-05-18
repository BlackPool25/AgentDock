from __future__ import annotations
import json
import os
import re
from pathlib import Path
from typing import Any
import yaml
from .schema import AgentConfig, MCPServerConfig


def _expand_env_vars(text: str) -> str:
    """Replace ${VAR} references with environment variable values."""
    return re.sub(r"\$\{([^}]+)\}", lambda m: os.environ.get(m.group(1), ""), text)


def _load_mcp_json(path: str = "/app/config/mcp.json") -> list[MCPServerConfig]:
    """Load MCP server configs from a standard mcp.json file.
    
    Supports the standard MCP config format used by Claude Desktop and other clients:
    {
      "mcpServers": {
        "server-name": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
          "env": {"API_KEY": "value"},
          "transport": "stdio"
        },
        "remote-server": {
          "url": "http://localhost:3000/sse",
          "transport": "sse"
        }
      }
    }
    """
    mcp_path = Path(path)
    if not mcp_path.exists():
        return []
    
    try:
        raw = mcp_path.read_text()
        expanded = _expand_env_vars(raw)
        data = json.loads(expanded)
    except Exception:
        return []
    
    servers = data.get("mcpServers", {})
    configs: list[MCPServerConfig] = []
    
    for name, cfg in servers.items():
        transport = cfg.get("transport", "stdio")
        # Normalize transport names
        if transport == "http":
            transport = "streamable-http"
        
        mcp_cfg = MCPServerConfig(
            name=name,
            transport=transport,
            url=cfg.get("url"),
            command=" ".join([cfg.get("command", "")] + cfg.get("args", [])) if cfg.get("command") else None,
            env=cfg.get("env", {}),
        )
        configs.append(mcp_cfg)
    
    return configs


def load_config(path: str = "/app/config/agent.yaml") -> AgentConfig:
    raw = Path(path).read_text()
    expanded = _expand_env_vars(raw)
    data = yaml.safe_load(expanded)
    
    # Merge mcp.json configs if present (mcp.json takes precedence for matching names)
    mcp_json_configs = _load_mcp_json()
    if mcp_json_configs:
        existing_names = {m["name"] for m in data.get("mcps", [])}
        for mcp_cfg in mcp_json_configs:
            if mcp_cfg.name not in existing_names:
                data.setdefault("mcps", []).append(mcp_cfg.model_dump())
    
    return AgentConfig.model_validate(data)
