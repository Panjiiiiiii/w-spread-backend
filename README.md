# W-Spread Backend Service

Backend service for **W-Spread** built with **Express.js**, **TypeScript**, and **Prisma ORM**.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **ORM**: Prisma
- **Database**: PostgreSQL (configurable in `prisma/schema.prisma`)
- **Security & Utilities**: Helmet, CORS, Morgan, Dotenv

---

## 📁 Project Architecture

Proyek ini menggunakan Clean Layered Architecture:

```text
src/
├── config/             # Konfigurasi aplikasi & database
│   ├── database.ts     # Singleton PrismaClient instance
│   └── env.ts          # Parsing & konfigurasi environment variables
├── controllers/        # Request & response handlers
│   ├── health.controller.ts
│   └── user.controller.ts
├── middlewares/        # Custom Express middlewares
│   ├── errorHandler.ts # Centralized global error handler
│   └── notFoundHandler.ts # 404 Route Not Found handler
├── routes/             # Definisi API routes
│   ├── index.ts        # Main aggregator router (/api/v1)
│   ├── health.routes.ts# /api/v1/health
│   └── user.routes.ts  # /api/v1/users
├── services/           # Business logic & interaksi Prisma ORM
│   └── user.service.ts
├── utils/              # Helper utilities
│   ├── apiError.ts     # Custom Http Exception class
│   └── apiResponse.ts  # Format response JSON standar
├── app.ts              # Konfigurasi Express app & middleware
└── server.ts           # Entry point listener & graceful shutdown
prisma/
└── schema.prisma       # Prisma data models & schema
```

---

## 🚀 Getting Started

### 1. Prasyarat
- Node.js v18 atau lebih baru
- PostgreSQL 14+ (lokal atau cloud seperti Supabase, Neon, atau Railway)
- Akun Google Cloud jika ingin menggunakan Google login
- Project Supabase jika ingin mengunggah avatar melalui endpoint register

### 2. Instalasi Dependencies
```bash
npm install
```

### 3. Konfigurasi Environment
Salin file `.env.example` menjadi `.env`. Di Windows PowerShell, gunakan:

```powershell
Copy-Item .env.example .env
```

Di macOS/Linux, gunakan:

```bash
cp .env.example .env
```

Isi semua nilai yang diperlukan di `.env`:

| Variable | Required | Keterangan |
|---|---:|---|
| `PORT` | No | Port HTTP server. Default `5000`. |
| `NODE_ENV` | No | Environment aplikasi, biasanya `development` atau `production`. |
| `DATABASE_URL` | Yes | Connection string PostgreSQL untuk Prisma. Gunakan pooled URL jika provider database menyediakannya. |
| `DIRECT_URL` | Yes | Direct PostgreSQL connection string untuk migration Prisma. Untuk database lokal, biasanya sama dengan `DATABASE_URL`. |
| `CORS_ORIGIN` | No | Origin frontend yang diizinkan, misalnya `http://localhost:3000`. Default `*` hanya cocok untuk development. |
| `GOOGLE_CLIENT_ID` | Only for Google login | Web client ID dari Google Cloud. Kosongkan jika hanya memakai email/password. |
| `SUPABASE_URL` | Only for image upload | Project URL Supabase, misalnya `https://<project-ref>.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Only for image upload | Service role key dari Supabase. **Jangan pernah memasukkan key ini ke frontend atau commit ke Git.** |
| `SUPABASE_STORAGE_BUCKET` | Only for image upload | Nama bucket Storage avatar. Default `avatars`. |
| `SESSION_TTL_DAYS` | No | Masa berlaku session dalam hari. Default `30`. |

Jangan membagikan atau meng-commit file `.env`. Gunakan `.env.example` sebagai template tanpa credentials.

#### Setup Google OAuth (opsional)
1. Buka **Google Cloud Console → APIs & Services → Credentials**.
2. Buat **OAuth client ID** dengan application type **Web application**.
3. Tambahkan origin frontend ke **Authorized JavaScript origins**.
4. Masukkan client ID tersebut ke `GOOGLE_CLIENT_ID`.
5. Pastikan frontend mengirim Google **ID token** ke `POST /api/v1/auth/google`.

#### Setup Supabase Storage (opsional, untuk avatar)
1. Buat atau pilih project di Supabase dan salin **Project URL** serta **service_role key** ke `.env`.
2. Buat bucket Storage dengan nama yang sama seperti `SUPABASE_STORAGE_BUCKET` (default: `avatars`).
3. Jadikan bucket tersebut **Public** karena backend mengembalikan public URL setelah upload.
4. Pastikan ukuran file maksimal 5 MB dan tipe file yang digunakan adalah JPEG, PNG, atau WebP.

### 4. Setup Database & Prisma
Pastikan PostgreSQL dapat diakses, lalu generate Prisma Client:

```bash
npm run prisma:generate
```

Buat dan jalankan migration:

```bash
npm run prisma:migrate
```

Untuk sinkronisasi schema tanpa membuat file migration (umumnya hanya untuk development), gunakan:

```bash
npm run prisma:push
```

Buka Prisma Studio (GUI database):

```bash
npm run prisma:studio
```

### 5. Menjalankan Server

**Mode Development (Hot-reload dengan TSX):**
```bash
npm run dev
```

**Mode Production (Build & Run):**
```bash
npm run build
npm start
```

---

## 🔐 Authentication & Membership Data Contract

The Prisma schema is ready for the API layer to add Google login and RevenueCat membership handling:

- `AuthAccount` stores the Google provider subject (`providerAccountId`) and links it to `User`.
- `Session` stores only a hash of a server-issued session token, plus expiry and revocation timestamps.
- `User.revenueCatAppUserId` is the stable RevenueCat `app_user_id`. Use the internal user ID as this value unless the client already has an established RevenueCat ID.
- `MembershipPlan` maps an internal plan to RevenueCat `productIdentifier` and `entitlementIdentifier`.
- `MembershipSubscription` stores the latest entitlement/subscription state for a user.
- `RevenueCatEvent.eventId` is unique so webhook processing can be idempotent; persist the payload before applying subscription changes.

Google OAuth token verification, session issuance, and the RevenueCat webhook route are not implemented by the current Express layer yet. They should resolve users through `AuthAccount` and update membership rows from verified RevenueCat webhook events, never from client-provided entitlement claims.

---

## 📡 API Endpoints

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/` | Root API info |
| `GET` | `/api/v1/health` | Health check endpoint |
| `GET` | `/api/v1/users` | Mendapatkan semua user |
| `GET` | `/api/v1/users/:id` | Mendapatkan user berdasarkan ID |
| `POST` | `/api/v1/users` | Membuat user baru |
| `DELETE`| `/api/v1/users/:id` | Menghapus user |
| `POST` | `/api/v1/auth/register` | Register email/password, optional avatar |
| `POST` | `/api/v1/auth/login` | Login email/password |
| `POST` | `/api/v1/auth/google` | Login dengan Google ID token |

---

### Auth payloads

Register JSON:

```json
{
  "email": "user@example.com",
  "password": "minimum-8-characters",
  "name": "User Name",
  "imageUrl": "https://optional-existing-image-url"
}
```

For a new image, send `multipart/form-data` with the same `email`, `password`, and `name` fields plus an `image` file (`JPEG`, `PNG`, or `WebP`, maximum 5 MB). The backend uploads it to the configured Supabase Storage bucket and saves the resulting URL in `users.imageUrl`.

Login JSON:

```json
{ "email": "user@example.com", "password": "minimum-8-characters" }
```

Google login JSON:

```json
{ "idToken": "token-returned-by-google-identity-services" }
```

The response contains an opaque `sessionToken`; store it securely on the client and send it as a bearer token when protected routes are added.

## 📜 Standard Response Format

**Success Response:**
```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": [],
  "meta": { "total": 0 }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Resource Not Found",
  "errors": null
}
```
