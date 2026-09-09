# Project Structure

## Project type

TypeScript Node.js backend using Express.js, Prisma ORM, and PostgreSQL.

## Functional domains

- Health: `GET /api/v1/health`
- User administration: list, read, create, and delete users under `/api/v1/users`
- Authentication and membership persistence: modeled in Prisma for Google identity, sessions, and RevenueCat subscription state; HTTP handlers are not yet implemented.

## Layers

- Entry point: `src/server.ts`
- Express composition: `src/app.ts`
- Routing: `src/routes/`
- Controllers: `src/controllers/`
- Business/data access: `src/services/`
- Cross-cutting middleware: `src/middlewares/`
- Configuration and persistence: `src/config/`, `prisma/schema.prisma`
- Response/error utilities: `src/utils/`
