FROM node:22-alpine

WORKDIR /app

COPY package.json ./

RUN apk add --no-cache git && npm install

COPY tsconfig.json ./
COPY src ./src
COPY config.json ./config.json
COPY workspace ./workspace

RUN npm run build

CMD ["npm", "start"]
