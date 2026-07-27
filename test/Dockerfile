# Playwright test runner. Browsers ship in this image only, never in the
# production image.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /test

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

CMD ["npx", "playwright", "test"]
