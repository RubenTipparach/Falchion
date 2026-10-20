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
COPY index.html tsconfig.json vite.config.ts vite.sim.config.ts ./
COPY src/ ./src/
COPY server/clock.json ./server/clock.json
RUN npx vite build && npx vite build --config vite.sim.config.ts

# 2) Runtime: zero-dependency Node server + built client
FROM node:22-slim
WORKDIR /app/server
COPY server/ ./
COPY --from=client /app/dist /app/dist
# The game rules, so the server keeps empires playing while their owners are away
COPY --from=client /app/server/sim ./sim
ARG BUILD_SHA=dev
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/dist BUILD_SHA=${BUILD_SHA}
EXPOSE 8080
CMD ["node", "index.mjs"]
