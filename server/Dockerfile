# Built from the REPOSITORY ROOT as the Docker context so the image can
# build the client (src/, index.html) and ship the server alongside it.
# The deploy workflow runs:
#   flyctl deploy --config server/fly.toml --dockerfile server/Dockerfile .

# 1) Build the client
FROM node:22-slim AS client
WORKDIR /app
ENV OPENSPEC_TELEMETRY=0
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY src/ ./src/
RUN npx vite build

# 2) Runtime: zero-dependency Node server + built client
FROM node:22-slim
WORKDIR /app/server
COPY server/ ./
COPY --from=client /app/dist /app/dist
ARG BUILD_SHA=dev
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/dist BUILD_SHA=${BUILD_SHA}
EXPOSE 8080
CMD ["node", "index.mjs"]
