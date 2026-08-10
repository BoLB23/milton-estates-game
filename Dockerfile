# syntax=docker/dockerfile:1.10
# Build the Vite application in a reproducible Node environment.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY .npmrc ./
RUN --mount=type=secret,id=npm_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token)" npm ci

COPY . .
ARG VITE_BASE_PATH=/games/milton-estates/
ARG VITE_GAME_PLATFORM_API_BASE_URL=https://games.bolblab.org/api/v1
RUN VITE_BASE_PATH="${VITE_BASE_PATH}" \
    VITE_GAME_PLATFORM_API_BASE_URL="${VITE_GAME_PLATFORM_API_BASE_URL}" \
    npm run build

# Serve the compiled static application with a small, unprivileged NGINX image.
FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
