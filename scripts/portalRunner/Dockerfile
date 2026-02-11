FROM mcr.microsoft.com/playwright:v1.58.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.js"]
