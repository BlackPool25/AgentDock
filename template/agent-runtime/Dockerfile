FROM python:3.11-slim
WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install system deps: git for memory commits, sudo for root-level shell, curl for MCP SSE
RUN apt-get update && apt-get install -y --no-install-recommends \
    git sudo curl procps net-tools \
    && rm -rf /var/lib/apt/lists/*

# Create non-root agent user
RUN useradd -m -u 1001 agent

# Allow agent user to run ALL commands via sudo without password
# This is safe: the container is isolated and the agent user is the only user
RUN echo "agent ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/agent \
    && chmod 0440 /etc/sudoers.d/agent

# Install Python dependencies as root (system-wide)
COPY pyproject.toml ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system -r pyproject.toml

# Copy app source
COPY app/ ./app/

# Create required directories and set ownership
RUN mkdir -p /memory /storage /workspace \
    && chown -R agent:agent /memory /storage /workspace /app

USER agent

ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
