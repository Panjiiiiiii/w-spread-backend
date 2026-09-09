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
- Node.js (v18+)
- Database PostgreSQL (lokal atau cloud seperti Supabase / Neon / Railway)

### 2. Instalasi Dependencies
```bash
npm install
```

### 3. Konfigurasi Environment
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Sesuaikan nilai `DATABASE_URL` di file `.env` dengan koneksi PostgreSQL Anda.

### 4. Setup Database & Prisma
Generate Prisma Client:
```bash
npm run prisma:generate
```

Jalankan database migration:
```bash
npm run prisma:migrate
```

Buka Prisma Studio (GUI Database):
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
