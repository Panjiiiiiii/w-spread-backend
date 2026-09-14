-- Run this script in the Supabase SQL editor after the Prisma migration.
-- The Express API still scopes every query by the authenticated userId.
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_owner_select" ON public.transactions
  FOR SELECT USING (auth.uid()::text = "userId");
CREATE POLICY "transactions_owner_insert" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid()::text = "userId");
CREATE POLICY "predictions_owner_select" ON public.predictions
  FOR SELECT USING (auth.uid()::text = "userId");
CREATE POLICY "predictions_owner_insert" ON public.predictions
  FOR INSERT WITH CHECK (auth.uid()::text = "userId");
