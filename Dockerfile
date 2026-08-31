FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p tabs backing_tracks

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
