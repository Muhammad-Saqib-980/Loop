FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-4000}/health" > /dev/null || exit 1
# Apply pending migrations before serving, so a fresh database gets its
# schema; exec hands PID 1 to node so it receives SIGTERM on shutdown.
CMD ["sh", "-c", "node dist/db/migrateCli.js && exec node dist/server.js"]
