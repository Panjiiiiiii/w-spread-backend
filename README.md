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

## 📡 API Endpoints

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/` | Root API info |
| `GET` | `/api/v1/health` | Health check endpoint |
| `GET` | `/api/v1/users` | Mendapatkan semua user |
| `GET` | `/api/v1/users/:id` | Mendapatkan user berdasarkan ID |
| `POST` | `/api/v1/users` | Membuat user baru |
| `DELETE`| `/api/v1/users/:id` | Menghapus user |

---

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
