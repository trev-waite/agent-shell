# Role-specific images from one Dockerfile (multi-target).
# Build from monorepo root:
#   docker build -f docker/Dockerfile --target gateway -t relay-gateway .
#   docker build -f docker/Dockerfile --target worker -t relay-worker .
#
# Topology: one gateway (HTTP/SSE + enqueue) → N workers (ReActLoop).
# UIs and apps/server are not shipped — only their package.json files so the
# frozen lockfile can resolve the workspace graph (removed after install).

FROM oven/bun:1.3.14-alpine AS base
WORKDIR /app

RUN addgroup -S relay && adduser -S -G relay relay

# ---------------------------------------------------------------------------
# Shared workspace manifests (lockfile completeness only)
# ---------------------------------------------------------------------------
FROM base AS manifest

COPY package.json bun.lock tsconfig.base.json ./
COPY apps/gateway/package.json apps/gateway/
COPY apps/worker/package.json apps/worker/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/terminal/package.json apps/terminal/
COPY packages/types/package.json packages/types/
COPY packages/runtime/package.json packages/runtime/
COPY packages/storage/package.json packages/storage/
COPY packages/providers/package.json packages/providers/
COPY packages/tools/package.json packages/tools/
COPY packages/tool-registry/package.json packages/tool-registry/
COPY packages/sdk/package.json packages/sdk/
COPY packages/coordination/package.json packages/coordination/
COPY packages/dispatch/package.json packages/dispatch/
COPY packages/pubsub/package.json packages/pubsub/

# ---------------------------------------------------------------------------
# Gateway — HTTP/SSE, queue dispatch. No worker app, no @relay/tools.
# ---------------------------------------------------------------------------
FROM manifest AS gateway

RUN bun install --frozen-lockfile --production --filter @relay/gateway \
 && rm -rf apps/worker apps/server apps/web apps/terminal \
      packages/tools packages/sdk

COPY apps/gateway apps/gateway
COPY packages/types packages/types
COPY packages/runtime packages/runtime
COPY packages/storage packages/storage
COPY packages/providers packages/providers
COPY packages/tool-registry packages/tool-registry
COPY packages/coordination packages/coordination
COPY packages/dispatch packages/dispatch
COPY packages/pubsub packages/pubsub

RUN chown -R relay:relay /app

USER relay

ENV RELAY_PORT=4310
ENV RELAY_HOST=0.0.0.0
EXPOSE 4310
CMD ["bun", "apps/gateway/src/index.ts"]

# ---------------------------------------------------------------------------
# Worker — claim tasks, run ReActLoop, publish events. Scale horizontally.
# ---------------------------------------------------------------------------
FROM manifest AS worker

RUN bun install --frozen-lockfile --production --filter @relay/worker \
 && rm -rf apps/gateway apps/server apps/web apps/terminal packages/sdk

COPY apps/worker apps/worker
COPY packages/types packages/types
COPY packages/runtime packages/runtime
COPY packages/storage packages/storage
COPY packages/providers packages/providers
COPY packages/tools packages/tools
COPY packages/tool-registry packages/tool-registry
COPY packages/coordination packages/coordination
COPY packages/dispatch packages/dispatch
COPY packages/pubsub packages/pubsub

RUN mkdir -p /workspace && chown -R relay:relay /app /workspace

USER relay

ENV WORKSPACE_DIR=/workspace
CMD ["bun", "apps/worker/src/index.ts"]
