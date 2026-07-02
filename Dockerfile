FROM node:22-slim

WORKDIR /app

COPY package.json ./
COPY . .

ENV NODE_ENV=production

CMD ["node", "server.js"]