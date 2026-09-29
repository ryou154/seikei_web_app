FROM node:22-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm@11.19.0 && pnpm install --prod --frozen-lockfile --ignore-scripts
COPY . .

ENV NODE_ENV=production

CMD ["node", "server.js"]
