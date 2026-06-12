# docker/agent-base.Dockerfile
# Base image for all AgentDock agent containers
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3 python3-pip curl wget git ffmpeg \
    build-essential jq unzip ca-certificates sudo \
    && rm -rf /var/lib/apt/lists/*

# Configure passwordless sudo for all users (needed when shell.level=root)
RUN echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers && \
    echo 'agentdock ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Create non-root user for restricted shell agents
RUN useradd -m -s /bin/bash agentdock && \
    usermod -aG sudo agentdock

# Install uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Copy dependency manifest first — uv sync is cached unless dependencies change
COPY pyproject.toml ./
RUN uv pip install --system fastapi "uvicorn[standard]" httpx pyyaml pydantic gitpython "apscheduler>=4.0.0a5" structlog watchfiles python-multipart mcp
RUN uv pip install --system "onnxruntime>=1.14.0"
RUN uv pip install --system torch --index-url https://download.pytorch.org/whl/cpu
RUN uv pip install --system "sentence-transformers>=3.0.0" "chromadb>=0.5.0"

# Copy application code last — changes here don't invalidate the uv sync cache
COPY app ./app

# Create required directories and initialize git repo for memory persistence
RUN mkdir -p /memory /storage/received /workspace && \
    git init /memory && \
    git -C /memory config user.email "agent@agentdock" && \
    git -C /memory config user.name "AgentDock"

HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD curl -f http://localhost:8080/health || exit 1

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
