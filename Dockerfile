FROM node:18.7.0

WORKDIR /app

COPY package.json package.json
COPY package-lock.json package-lock.json

RUN npm install

COPY . .

RUN npm run build

CMD [ "node", "dist/index.js" ]