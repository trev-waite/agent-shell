# Single image, two entrypoints (gateway | worker).
# Build from monorepo root: docker build -f docker/Dockerfile -t relay .

FROM oven/bun:1.3 AS base
WORKDIR /app

COPY package.json bun.lock turbo.json tsconfig.base.json ./
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

RUN bun install --frozen-lockfile

COPY apps/gateway apps/gateway
COPY apps/worker apps/worker
COPY packages packages
# Minimal stubs so workspace package.json resolution stays valid without shipping UIs
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/terminal/package.json apps/terminal/

ENV RELAY_PORT=4310
ENV RELAY_HOST=0.0.0.0
EXPOSE 4310

# Default: gateway. Override command for worker.
CMD ["bun", "apps/gateway/src/index.ts"]
