FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4004 DATA_DIR=/data TZ=Europe/Lisbon
RUN apk add --no-cache tzdata && mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/package.json ./
USER node
VOLUME /data
EXPOSE 4004
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "build"]
