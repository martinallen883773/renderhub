#!/usr/bin/env bash
# ===============================================
# إنشاء جداول قاعدة البيانات (فارغة) على Render PostgreSQL
# ===============================================
# الاستخدام:
#   export DATABASE_URL="postgresql://...  (External Database URL من Render)"
#   bash restore.sh
# -----------------------------------------------
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "خطأ: من فضلك اضبط متغير DATABASE_URL أولاً."
  echo 'مثال: export DATABASE_URL="postgresql://user:pass@host/db"'
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"

echo ">> إنشاء الجداول (Schema) بشكل فارغ..."
psql "$DATABASE_URL" -f "$DIR/01_schema.sql"

echo ">> تم إنشاء الجداول الفارغة بنجاح ✔"
