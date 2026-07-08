# ===============================================
# LastMailer - Dockerfile for Fly.io
# ===============================================
FROM node:20-slim AS build

WORKDIR /app

# تثبيت كل التبعيات (بما فيها devDependencies لأدوات البناء)
COPY package.json package-lock.json ./
RUN npm install --include=dev

# نسخ الكود وبناء التطبيق
COPY . .
RUN npm run build

# ---- مرحلة التشغيل ----
FROM node:20-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

# نسخ التبعيات والملفات المبنية فقط
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/shared ./shared

EXPOSE 8080
ENV PORT=8080

CMD ["npm", "run", "start"]
