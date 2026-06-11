# --- build stage -------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json vite.config.ts ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

# --- runtime stage ------------------------------------------------------------
# bookworm-slim (glibc) so better-sqlite3 uses its prebuilt binaries
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    PORT=3210
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3210
VOLUME ["/app/data"]
CMD ["node", "dist/server/index.js"]
