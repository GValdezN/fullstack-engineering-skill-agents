FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node . .
USER node
ENTRYPOINT ["node", "entrypoint.mjs"]
CMD ["node", "server.mjs"]
