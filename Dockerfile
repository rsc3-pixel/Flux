# Flux — production image for Fly.io / any Docker host
# Stays single-stage to keep things readable. better-sqlite3 needs a C++
# toolchain to compile the native binding for the target arch.

FROM node:20-bookworm-slim

WORKDIR /app

# Build deps for better-sqlite3 (gets removed after npm ci to keep image small)
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 build-essential ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm ci --omit=dev

# Strip build deps now that better-sqlite3 is compiled
RUN apt-get purge -y python3 build-essential \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# App source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
# Set ALLOW_REGISTRATION=false on the host (e.g. via `fly secrets set`) once
# you've created your first account, so cadastro fica trancado.

EXPOSE 3000
CMD ["node", "server/server.js"]
