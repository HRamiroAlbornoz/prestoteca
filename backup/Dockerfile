# The official Postgres 18 image brings pg_dump, pg_restore and psql in the same
# major version as the production server (a pg_dump older than the server refuses to run).
FROM postgres:18-alpine

RUN apk add --no-cache nodejs npm

WORKDIR /app

# Dependencies first, so Docker can reuse this layer while only the code changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# The image's default entrypoint starts a Postgres server; this job only needs the client tools.
ENTRYPOINT []
# The unprivileged user that the image already provides.
USER postgres

CMD ["node", "src/main.mjs"]
