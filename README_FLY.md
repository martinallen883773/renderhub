# 🪰 نشر LastMailer على Fly.io — الشرح الكامل بالعربي

هذا الملف يشرح خطوة بخطوة كيفية تشغيل المشروع على **Fly.io** مع قاعدة بيانات PostgreSQL **فارغة (الجداول فقط)**.

> ملاحظة: أنا (المساعد) لا أملك صلاحية الدخول إلى حسابك على Fly.io، لذلك لا أستطيع النشر نيابةً عنك. لكن كل الملفات جاهزة (`Dockerfile`, `fly.toml`) والأوامر مكتوبة حرفياً لتنفّذها بنفسك.

---

## 📦 ملفات Fly.io في المشروع

```
Dockerfile        وصفة بناء التطبيق
fly.toml          إعدادات Fly.io (الاسم، المنطقة، المنفذ)
.dockerignore     استبعاد ملفات غير ضرورية من البناء
```

---

## الخطوة 1️⃣ — تثبيت أداة Fly (مرة واحدة)

- **ويندوز (PowerShell):**
  ```powershell
  iwr https://fly.io/install.ps1 -useb | iex
  ```
- **ماك / لينكس:**
  ```bash
  curl -L https://fly.io/install.sh | sh
  ```

ثم سجّل الدخول (سيفتح المتصفح):
```bash
fly auth login
```
إن لم يكن لديك حساب: `fly auth signup`.

---

## الخطوة 2️⃣ — تجهيز المشروع

افتح Terminal داخل مجلد المشروع (بعد فك ضغط `backupRender.zip`):
```bash
cd lastmailer
```

افتح ملف `fly.toml` وغيّر السطر:
```toml
app = "lastmailer"
```
إلى اسم **فريد** خاص بك، مثل `app = "lastmailer-ahmed-2026"` (لأن الأسماء عامة على Fly).

---

## الخطوة 3️⃣ — إنشاء التطبيق

```bash
fly launch --no-deploy
```
- عندما يسأل عن استخدام `fly.toml` الموجود اختر **Yes**.
- اختر المنطقة (مثل `fra` فرانكفورت).
- **لا تنشر بعد** (اخترنا `--no-deploy`) لأننا نحتاج إنشاء قاعدة البيانات أولاً.

---

## الخطوة 4️⃣ — إنشاء قاعدة بيانات PostgreSQL وربطها

```bash
fly postgres create --name lastmailer-db --region fra
```
اختر التكوين الأصغر (Development - مجاني/رخيص). بعد الإنشاء اربطها بالتطبيق:
```bash
fly postgres attach lastmailer-db --app اسم_تطبيقك
```
هذا يضيف متغير `DATABASE_URL` تلقائياً إلى تطبيقك. ✔

---

## الخطوة 5️⃣ — إضافة المفاتيح السرية

```bash
fly secrets set SESSION_SECRET="نص-طويل-عشوائي-اكتبه-بنفسك"
fly secrets set JACAT_API_KEY="d99746961595b0a70eb2304c30d2fe"
fly secrets set OPENAI_API_KEY="sk-مفتاحك-من-openai"
```
> `OPENAI_API_KEY` اختياري (فقط لميزات الذكاء الاصطناعي). `DATABASE_URL` تم ضبطه تلقائياً في الخطوة السابقة.

---

## الخطوة 6️⃣ — النشر 🚀

```bash
fly deploy
```
Fly سيبني الـ Docker image ويشغّل التطبيق. انتظر حتى تظهر رسالة النجاح.

---

## الخطوة 7️⃣ — إنشاء الجداول الفارغة

بعد أول نشر ناجح، أنشئ الجداول مرة واحدة عبر تشغيل الأمر داخل السيرفر:
```bash
fly ssh console -C "npm run db:push"
```
هذا يُنشئ كل الجداول الفارغة تلقائياً في قاعدة البيانات. ✔

> بديل: من جهازك مع External DATABASE_URL:
> ```bash
> cd db_backup && export DATABASE_URL="..." && bash restore.sh
> ```

---

## الخطوة 8️⃣ — فتح التطبيق

```bash
fly open
```
أو افتح الرابط `https://اسم_تطبيقك.fly.dev`.

---

## 🔁 التحديثات المستقبلية

بعد أي تعديل على الكود، فقط:
```bash
fly deploy
```

---

## ⚙️ ملاحظات

- الخطة المجانية تُنيم الآلة عند الخمول (`auto_stop_machines`) وتستيقظ عند أول طلب.
- ملفات الصور المرفوعة قد تُفقد عند إعادة النشر (نظام ملفات مؤقت). للحفظ الدائم أضف **Fly Volume** واربطه بمجلد `image_tags`.
- لمشاهدة السجلات: `fly logs`.
- لعرض حالة الآلات: `fly status`.
