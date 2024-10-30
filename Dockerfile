FROM node:current-alpine

WORKDIR /app
COPY . .

RUN apk add python3 build-base gcc g++ make
RUN npm install
RUN npx tsc

ENTRYPOINT node dist/index.js
