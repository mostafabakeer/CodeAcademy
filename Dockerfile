# ===== مرحلة البناء: تثبيت الحزم وبناء الواجهة والسيرفر =====
FROM node:20-alpine AS build

WORKDIR /app

# نسخ ملفات الحزم أولاً للاستفادة من الكاش
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# تثبيت الحزم (client + server)
RUN npm install --no-audit --no-fund --prefix client \
  && npm install --no-audit --no-fund --prefix server

# نسخ الكود المصدري وبناء كل شيء
COPY . .
RUN npm run build --prefix client
RUN npm run build --prefix server

# ===== مرحلة التشغيل: السيرفر فقط + الواجهة المبنية =====
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
COPY package*.json ./

EXPOSE 4000

# البيانات في Supabase — لا حاجة لأي مجلد بيانات محلي
CMD ["sh", "-c", "cd server && node dist/index.js"]
