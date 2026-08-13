# ===== مرحلة البناء: بناء الواجهة الأمامية =====
FROM node:20-alpine AS build

WORKDIR /app

# نسخ ملفات الحزم أولاً للاستفادة من الكاش
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# تثبيت الحزم (root + server + client)
RUN npm install --no-audit --no-fund \
  && npm install --no-audit --no-fund --prefix server \
  && npm install --no-audit --no-fund --prefix client

# نسخ الكود المصدري وبناء الواجهة
COPY . .
RUN npm run build --prefix client

# ===== مرحلة التشغيل: السيرفر فقط + الواجهة المبنية =====
FROM node:20-alpine AS server

WORKDIR /app

ENV NODE_ENV=production

COPY server/package*.json ./server/
RUN npm install --no-audit --no-fund --prefix server

COPY server ./server
COPY --from=build /app/client/dist ./client/dist

EXPOSE 4000

VOLUME ["/app/server/data", "/app/server/uploads"]

CMD ["sh", "-c", "cd server && npx tsx src/index.ts"]
