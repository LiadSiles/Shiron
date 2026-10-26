# Build from the repository root (the server shares the category list with the app):
#   docker build -f server/Dockerfile -t shiron-server .
FROM node:26-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm install --no-save tsx

COPY server/src ./src
COPY app/src/core/categories.ts /srv/app/src/core/categories.ts

ENV NODE_ENV=production PORT=8787
EXPOSE 8787
USER node
CMD ["node", "--import", "tsx", "src/index.ts"]
