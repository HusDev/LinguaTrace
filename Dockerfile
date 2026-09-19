# LinguaTrace runs as a long-lived server, not as serverless functions.
#
# Lessons are stored in SQLite on a local disk, and a lesson has to survive the
# request that created it, so the app needs a host that keeps a filesystem
# between requests. That rules out platforms whose functions start empty each
# time unless the database is moved to a hosted one first.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The tldraw licence is read in the browser, so it is inlined into the bundle
# during the build. A runtime secret would never reach it.
ARG NEXT_PUBLIC_TLDRAW_LICENSE_KEY=""
ENV NEXT_PUBLIC_TLDRAW_LICENSE_KEY=$NEXT_PUBLIC_TLDRAW_LICENSE_KEY
RUN npm run build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# The database lives on the mounted volume, not in the image.
ENV LINGUATRACE_DB=/data/linguatrace.db

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
