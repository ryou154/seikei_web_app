FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional
COPY . .

ENV NODE_ENV=production

CMD ["node", "server.js"]