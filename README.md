# TrueID Confluence Source

เว็บ static สำหรับ**เก็บและแสดง HTML** แล้ว**ฝัง (embed) บน Confluence** ผ่าน iframe

## โครงสร้าง

```text
index.html                 # คลังหน้า + ปุ่มคัดลอก iframe
portal/                    # หน้าอัปโหลด HTML + resources
server/                    # API เช็ค path / อัปโหลด / git deploy
manifest.json              # รายการหน้าทั้งหมด
assets/                    # CSS / JS ร่วม
pages/<slug>/index.html    # เนื้อหาแต่ละหน้า
_headers                   # อนุญาต frame (Cloudflare / Netlify)
netlify.toml               # header สำหรับ Netlify
```

## Upload portal (แนะนำ)

อัปโหลด HTML + resources ผ่านเว็บ แล้วระบบจะ:

1. เช็ค **URL path ห้ามซ้ำ** (เทียบ `manifest.json` + โฟลเดอร์ `pages/`)
2. วางไฟล์ที่ `pages/<path>/index.html` (+ resources)
3. อัปเดต `manifest.json`
4. `git commit` + `git push` → host (GitHub Pages / Cloudflare) deploy เอง

```bash
cp .env.example .env
npm install
npm start
# เปิด http://127.0.0.1:8787/portal/
```

ใน portal:

- กรอก **URL path** เช่น `promo-q1` → ได้  
  `https://trueid-confluence-source.signalbay.fyi/pages/promo-q1/`
- แนบ HTML หลัก + resources (ถ้ามี) → กดอัปโหลด

ตั้ง `GIT_DEPLOY=false` ใน `.env` ถ้าอยากทดลองเขียนไฟล์โดยไม่ push

## เพิ่มหน้าใหม่ด้วยมือ (~2 นาที)

1. สร้างโฟลเดอร์ `pages/<slug>/index.html`
2. ลิงก์ CSS/JS แบบ relative จากหน้าลูก:
   - `../../assets/site.css`
   - `../../assets/embed.js`
3. ใส่ `data-hide-in-embed` บนองค์ประกอบที่ไม่อยากโชว์ตอนฝัง (เช่น topbar)
4. เพิ่มรายการใน `manifest.json`:

```json
{
  "slug": "my-page",
  "title": "My page",
  "description": "สั้นๆ",
  "tags": ["docs"],
  "embedHeight": 560
}
```

5. Push ขึ้น `main` → site อัปเดต

## ฝังบน Confluence

1. เปิดคลังหน้าบนเว็บ → กด **คัดลอก iframe**
2. บน Confluence ใส่ HTML macro / Iframe macro แล้ววางโค้ด เช่น:

```html
<iframe
  src="https://YOUR-HOST/pages/welcome/?embed=1"
  width="100%"
  height="520"
  style="border:0;border-radius:8px;"
  loading="lazy"
></iframe>
```

`?embed=1` จะซ่อนแถบนำทางให้เหลือแต่เนื้อหา

## Hosting (สำคัญสำหรับ iframe)

| Host | เปิดดูในเบราว์เซอร์ | ฝัง iframe ใน Confluence |
|------|---------------------|---------------------------|
| **Cloudflare Pages / Netlify** (แนะนำ) | ได้ | ได้ — มี `frame-ancestors *` |
| **GitHub Pages** | ได้ | มัก**ไม่ได้** — CDN ใส่ `X-Frame-Options: deny` |

### เปิด GitHub Pages (ดูคลัง / preview)

1. Repo → **Settings → Pages**
2. Source = **Deploy from a branch** → Branch `main` / folder `/ (root)`
3. Save แล้วรอ deploy
4. URL ประมาณ: `https://sebbersky.github.io/trueid-confluence-source/`

> ถ้าต้องการ GitHub Actions deploy แทน branch deploy: เพิ่ม workflow ภายหลังหลัง `gh auth refresh -s workflow` (token ปัจจุบันไม่มี `workflow` scope)

### เปิด Cloudflare Pages (สำหรับ embed จริง)

1. [Cloudflare Pages](https://pages.cloudflare.com/) → Create → Connect GitHub repo นี้
2. Build command: ว่าง / Framework preset: None
3. Output directory: `/` (root)
4. Deploy แล้วใช้ URL ของ Cloudflare ใน iframe บน Confluence

Netlify ก็ต่อ GitHub แบบเดียวกันได้ — อ่าน `netlify.toml` ให้อยู่แล้ว

## รันดู local

```bash
cd trueid-confluence-source
python3 -m http.server 8080
# เปิด http://127.0.0.1:8080/
```

## หมายเหตุ Confluence

- ต้องมีสิทธิ์ใช้ **HTML macro** หรือแอป iframe ของ instance
- ถ้าขึ้น `refused to connect` = โฮสต์บล็อก frame → ย้ายไป Cloudflare/Netlify
- เนื้อหาใน repo นี้เป็น public บน host ที่เลือก — อย่าใส่ secret / PII
