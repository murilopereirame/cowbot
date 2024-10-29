FROM node:current-alpine

WORKDIR /app
COPY . .

RUN npm install
RUN npx tsc

ENTRYPOINT node dist/index.js
