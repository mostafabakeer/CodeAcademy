# ===== مرحلة البناء: تثبيت الحزم وبناء الواجهة والسيرفر =====
FROM node:20-alpine AS build

WORKDIR /app

# نسخ ملفات الحزم أولاً للاستفادة من الكاش
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# تثبيت الحزم (client + server) — مع كل ما يلزم للبناء (dev deps)
RUN npm install --no-audit --no-fund --prefix client \
  && npm install --no-audit --no-fund --prefix server

# نسخ الكود المصدري وبناء كل شيء
COPY . .
RUN npm run build --prefix client
RUN npm run build --prefix server

# ===== مرحلة التشغيل: سيرفر خفيف + الواجهة المبنية + deps الإنتاجية فقط =====
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# تثبيت اعتماديات السيرفر الإنتاجية فقط (أصغر وأأمن)
COPY --from=build /app/server/package*.json ./server/
RUN npm install --omit=dev --no-audit --no-fund --prefix server

# نسخ السيرفر المُجمَّع والواجهة المبنية
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

EXPOSE 4000

# البيانات في Supabase — لا حاجة لأي مجلد بيانات محلي
CMD ["sh", "-c", "cd server && node dist/index.js"]
