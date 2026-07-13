# syntax=docker/dockerfile:1
# ---- deps ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- run (standalone) ----
FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100
# python3 cần cho một số script eduSkill (build .docx, chart). Bỏ nếu engine không cần.
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/standalone/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3100
CMD ["node", "server.js"]
