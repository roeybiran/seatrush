FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src

# `docker compose run --rm test` runs the suite against the Compose database.
FROM deps AS test
COPY tsconfig.test.json vitest.config.mts ./
COPY test ./test
CMD ["npm", "test"]

FROM deps AS runtime
RUN npm run build && npm prune --omit=dev
EXPOSE 3000
CMD ["node", "dist/main.js"]
