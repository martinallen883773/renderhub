# 🚀 نشر LastMailer على Render.com عبر GitHub — الشرح الكامل

هذا الملف يشرح خطوة بخطوة كيفية رفع المشروع على **GitHub** ثم ربطه بـ **Render.com** ليعمل كـ **Web Service** مع قاعدة بيانات PostgreSQL **فارغة (الجداول فقط بدون بيانات)**.

> ⚠️ ملاحظة مهمة: أنا (المساعد) لا أملك صلاحية الدخول إلى حساب GitHub أو Render الخاص بك، لذلك لا أستطيع إنشاء الـ repo أو الـ Web Service نيابةً عنك. لكنني جهّزت لك **كل الملفات جاهزة** والأوامر مكتوبة حرفياً لتنفّذها بنفسك في دقائق (نسخ ولصق).

---

## 📦 محتويات الملف المضغوط (backupRender.zip)

```
client/              الواجهة الأمامية (React)
server/              الخادم (Express)
shared/              المخططات المشتركة (schema)
script/ , scripts/   سكربتات البناء
image_tags/          مجلد الصور
db_backup/           قاعدة البيانات (فارغة)
  ├─ 01_schema.sql   بنية الجداول فقط (بدون أي بيانات)
  └─ restore.sh      سكربت إنشاء الجداول تلقائياً
render.yaml          إعدادات Render الجاهزة (Blueprint)
.env.example         نموذج متغيرات البيئة
package.json         التبعيات وأوامر التشغيل
```

> 🗄️ قاعدة البيانات هنا **فارغة تماماً** — الجداول التسعة تُنشأ بدون أي صفوف. ستضيف سيرفرات SMTP والقوالب والتاجات بنفسك من داخل التطبيق بعد التشغيل.

---

## الخطوة 1️⃣ — فك الضغط

فك ضغط `backupRender.zip` في مجلد على جهازك، وليكن اسمه `lastmailer`.

---

## الخطوة 2️⃣ — رفع المشروع على GitHub

1. سجّل الدخول إلى https://github.com ثم اضغط **New repository**.
2. اكتب اسماً مثل `lastmailer` واتركه **Private** (خاص) ثم **Create repository**.
3. من داخل مجلد المشروع على جهازك، نفّذ الأوامر التالية (استبدل `USERNAME` باسمك):

```bash
cd lastmailer
git init
git add .
git commit -m "Initial LastMailer deploy for Render"
git branch -M main
git remote add origin https://github.com/USERNAME/lastmailer.git
git push -u origin main
```

> إذا طُلبت كلمة المرور، استخدم **Personal Access Token** من GitHub (Settings → Developer settings → Personal access tokens) بدلاً من كلمة المرور.

---

## الخطوة 3️⃣ — إنشاء الخدمة على Render (Blueprint تلقائي)

الملف `render.yaml` يُنشئ **الويب سيرفس + قاعدة البيانات** معاً تلقائياً.

1. سجّل الدخول إلى https://render.com (يمكنك الدخول بحساب GitHub).
2. اضغط **New +** → **Blueprint**.
3. اختر مستودع GitHub الذي رفعته (اضغط **Connect** وامنح Render صلاحية الوصول).
4. سيقرأ Render ملف `render.yaml` ويعرض خدمة `lastmailer` وقاعدة بيانات `lastmailer-db`.
5. اضغط **Apply**. سيُنشئ Render قاعدة البيانات ويبدأ بناء التطبيق.

### (بديل يدوي بدون Blueprint)
- **New + → PostgreSQL** لإنشاء قاعدة بيانات، انسخ الـ Internal Database URL.
- **New + → Web Service** واربطه بالـ repo. اضبط:
  - Build Command: `npm install --include=dev && npm run build && npm run db:push`
  - Start Command: `npm run start`
  - أضف متغير `DATABASE_URL` بقيمة الـ Internal Database URL.

---

## الخطوة 4️⃣ — ضبط المفاتيح السرية (Environment Variables)

افتح خدمة `lastmailer` → تبويب **Environment** وأضف:

| المتغير | القيمة |
|---------|--------|
| `OPENAI_API_KEY` | مفتاح OpenAI من https://platform.openai.com/api-keys (لميزات الذكاء الاصطناعي) |
| `JACAT_API_KEY` | `d99746961595b0a70eb2304c30d2fe` (لاختصار الروابط) |
| `OPENAI_BASE_URL` | اتركه فارغاً إلا لو تستخدم مزوداً بديلاً |

> `DATABASE_URL` و`SESSION_SECRET` و`NODE_ENV` تُضبط تلقائياً من `render.yaml`.

اضغط **Save Changes** (سيُعاد النشر تلقائياً).

---

## الخطوة 5️⃣ — إنشاء الجداول (تلقائي ✅)

**لا تحتاج أي خطوة يدوية.** أمر البناء في `render.yaml` ينتهي بـ `npm run db:push`، وهذا يُنشئ كل الجداول الفارغة تلقائياً في قاعدة البيانات أثناء كل عملية نشر. بمجرد نجاح البناء ستكون الجداول جاهزة.

> 🛟 طريقة يدوية احتياطية (فقط لو احتجتها): من Render افتح `lastmailer-db` → انسخ **External Database URL**، ثم على جهازك:
> ```bash
> cd lastmailer/db_backup
> export DATABASE_URL="ألصق_هنا_الـ_External_Database_URL"
> bash restore.sh
> ```
> لمستخدمي ويندوز: `psql "%DATABASE_URL%" -f 01_schema.sql`

---

## الخطوة 6️⃣ — التشغيل

افتح رابط الخدمة (مثل `https://lastmailer.onrender.com`) وابدأ بإضافة سيرفرات SMTP والقوالب من داخل التطبيق.

---

## 🔁 التحديثات المستقبلية

```bash
git add .
git commit -m "update"
git push
```

Render سيكتشف الدفع ويعيد النشر تلقائياً. ✅

---

## ⚙️ ملاحظات مهمة

- **الخطة المجانية** في Render تُنيم الخدمة بعد 15 دقيقة خمول وتستيقظ خلال ~30 ثانية.
- قاعدة البيانات المجانية على Render تنتهي بعد 90 يوماً — خذ نسخة احتياطية دورية (`pg_dump`).
- ملفات الصور المرفوعة قد تُفقد عند إعادة النشر على الخطة المجانية (نظام ملفات مؤقت). للحفظ الدائم استخدم Persistent Disk في خطة مدفوعة.
- تأكد أن منافذ SMTP (مثل 587) غير محجوبة.
