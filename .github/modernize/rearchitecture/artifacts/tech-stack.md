# Tech Stack

- Runtime: Node.js 18+ (README prerequisite)
- Language: TypeScript 5.7
- Framework: Express 4.21
- ORM and client: Prisma 6.4
- Database: PostgreSQL
- Middleware: Helmet, CORS, Morgan, Dotenv
- Development/build: `tsx watch`, `tsc`, `rimraf`
- Authentication state: Google account identity and server sessions are represented in Prisma; OAuth verification and token issuance are not yet present in source.
- Membership state: RevenueCat product, entitlement, subscription, and webhook-event persistence is represented in Prisma; RevenueCat SDK/webhook handlers are not yet present in source.

## Current blockers

- No authentication routes or middleware exist.
- No RevenueCat webhook route or event processor exists.
- `ENV` currently validates neither OAuth nor RevenueCat configuration.
