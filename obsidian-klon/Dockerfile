FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3333
CMD ["sh", "-c", "[ -f /app/auth.json ] || echo 'null' > /app/auth.json && node src/server/app.js"]
