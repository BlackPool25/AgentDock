# docker/agent-base.Dockerfile
# Base image for all AgentDock agent containers
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3 python3-pip curl wget git ffmpeg \
    build-essential jq unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Copy Python project files
COPY agent-runtime/pyproject.toml ./
# uv.lock is optional at build time — generated on first sync
RUN uv sync --no-dev 2>/dev/null || uv sync

COPY agent-runtime/app ./app

# Create required directories
RUN mkdir -p /memory /storage/received /workspace

# Git config for memory commits
RUN git config --global user.email "agent@agentdock" && \
    git config --global user.name "AgentDock"

HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD curl -f http://localhost:8080/health || exit 1

EXPOSE 8080

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
