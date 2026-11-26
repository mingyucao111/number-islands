FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY voyage/appearance.mjs voyage/combat-rules.mjs voyage/progression.mjs ./voyage/
ENV NODE_ENV=production
CMD ["node", "server/ranked-server.mjs"]
