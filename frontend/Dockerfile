# Build stage: compile the Vite/React app to static assets.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Baked at build time (Vite inlines import.meta.env). The default points at
# the compose-published backend port on the host, which is where the
# BROWSER makes its calls from — not container-to-container.
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Serve stage: static files via unprivileged nginx (non-root, port 8080),
# with SPA fallback so deep links like /history resolve to index.html.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
