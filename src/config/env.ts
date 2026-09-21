import dotenv from 'dotenv';

dotenv.config();

export const ENV = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || '',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET || 'avatars',
  // Private bucket for original uploaded e-statement PDFs. Must NOT be made
  // public (no getPublicUrl usage) — these are private financial documents,
  // accessed only via short-lived signed URLs. See storage.service.ts.
  SUPABASE_STATEMENTS_BUCKET: process.env.SUPABASE_STATEMENTS_BUCKET || 'statements',
  SESSION_TTL_DAYS: process.env.SESSION_TTL_DAYS ? parseInt(process.env.SESSION_TTL_DAYS, 10) : 30,
  REVENUECAT_WEBHOOK_SECRET: process.env.REVENUECAT_WEBHOOK_SECRET || '',
};
