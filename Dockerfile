# Stars Organizer's image: the built web app AND the API on one port (8080), so an install is Postgres +
# Electric + this, and the browser talks to one origin behind any reverse proxy. On start it waits for
# Postgres, applies schema.sql and creates its keys (server/boot.ts), so nothing runs by hand.
#
# Everything is built on the build machine's own platform: the web build is static files and the server's
# dependencies are plain JavaScript, so the arm64 image is the same files on an arm64 Node, with no
# emulation. Node runs the server's TypeScript directly (type stripping, Node 22.18+).
# Built for linux/amd64 and linux/arm64 by .github/workflows/images.yml.

FROM --platform=$BUILDPLATFORM node:24-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit
COPY . .
# Empty: the web app calls /api on its own origin. See src/lib/api.ts.
ENV VITE_API_URL=""
RUN npm run build

FROM --platform=$BUILDPLATFORM node:24-alpine AS server
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit
COPY server/*.ts ./
RUN rm -f *.test.ts

# Only COPY from here on: a RUN in this stage would need arm64 emulation.
FROM node:24-alpine
WORKDIR /app
COPY --from=server /app/server ./server
COPY schema.sql ./
COPY --from=web /app/dist ./dist

USER node
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    WEB_ROOT=dist
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/boot.ts"]

LABEL org.opencontainers.image.title="Stars Organizer" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
