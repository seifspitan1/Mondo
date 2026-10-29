# MONDO — دليل البدء السريع للمطور (عربي)

تم تحويل الموقع بالكامل إلى المعمارية الجديدة المعتمدة على:
- **الواجهة الأمامية:** HTML5 خام، CSS3 خام (`public/css/style.css`)، وJavaScript باستخدام ES Modules (`public/js/`). بدون React أو Next.js أو Tailwind.
- **الخادم الخلفي:** Node.js مع Express للتطوير المحلي، ودوال Vercel Serverless Functions في `api/v1/`.
- **قاعدة البيانات والتخزين:** Supabase PostgreSQL مع بادئة `mondo_`، وتخزين Supabase Storage للملفات.
- **المصادقة:** نظام JWT مخصص مع كوكيز HttpOnly وThrottling للحماية من التخمين.

---

## 1. متطلبات التشغيل

- **Node.js:** إصدار 20 أو أحدث (يفضل Node 22 LTS).
- **npm:** مثبت تلقائياً مع Node.js.

---

## 2. التشغيل على Windows / PowerShell

افتح PowerShell داخل مجلد المشروع:

```powershell
# 1. تثبيت الحزم عبر npm
npm install

# 2. إنشاء ملف الإعدادات البيئية من القالب
Copy-Item .env.example .env

# 3. تشغيل الفحوصات والاختبارات الآلية
npm test

# 4. تشغيل خادم التطوير المحلي
npm run dev
```

افتح المتصفح على: `http://localhost:3000`

---

## 3. إعداد Supabase (قاعدة البيانات والتخزين)

1. أنشئ مشروعاً جديداً على [Supabase](https://supabase.com).
2. افتح **SQL Editor** في لوحة تحكم Supabase.
3. انسخ محتوى الملف `supabase/schema.sql` ونفّذه لإنشاء الجداول وسياسات الأمان وسلة التخزين `mondo-media`.
4. انسخ محتوى الملف `supabase/seed.sql` ونفّذه لإدخال المشاريع والباقات الافتراضية.
5. من **Project Settings > API**، انسخ:
   - رابط المشروع إلى `SUPABASE_URL`.
   - مفتاح `service_role (secret)` إلى `SUPABASE_SERVICE_ROLE_KEY`.
6. ضع هذه القيم داخل ملف `.env` محلياً، أو في إعدادات البيئة على Vercel.

---

## 4. دخول لوحة الإدارة (`/admin`)

1. اضبط اسم المستخدم وكلمة المرور في `.env`:
   ```env
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=كلمة_مرور_قوية_هنا
   JWT_SECRET=مفتاح_عشوائي_طويل_32_حرف
   ```
2. افتح في المتصفح: `http://localhost:3000/admin`
3. سجّل الدخول لإدارة المشاريع والباقات وتعديل تفاصيل الاستوديو والاطلاع على طلبات التواصل الواردة.

---

## 5. النشر على Vercel عبر GitHub

1. اربط المشروع بمستودع GitHub.
2. استورد المستودع في منصة Vercel واختر نوع المشروع **Other**.
3. أضف متغيرات البيئة في Vercel:
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `JWT_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET=mondo-media`
4. اضغط **Deploy**.
