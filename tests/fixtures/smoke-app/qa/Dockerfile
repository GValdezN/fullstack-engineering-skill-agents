FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /qa
COPY package.json package-lock.json ./
RUN npm ci
COPY browser.mjs ./
CMD ["node", "browser.mjs"]
