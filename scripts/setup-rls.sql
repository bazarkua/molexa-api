-- scripts/setup-rls.sql

-- 1. Enable RLS on monthly_summaries
ALTER TABLE public.monthly_summaries ENABLE ROW LEVEL SECURITY;

-- 2. Allow public read access (anon role)
-- This allows anyone (including the frontend if it connects directly, 
-- and the backend if it uses the anon key) to READ data.
CREATE POLICY "Allow public read access" ON public.monthly_summaries
FOR SELECT TO anon, authenticated USING (true);

-- 3. Enable RLS on api_requests (Recommended for security)
ALTER TABLE public.api_requests ENABLE ROW LEVEL SECURITY;

-- 4. Allow public read access to api_requests? 
-- If you want the frontend to read individual requests directly, uncomment the next line.
-- Otherwise, keep it private (backend only).
-- CREATE POLICY "Allow public read access" ON public.api_requests FOR SELECT TO anon, authenticated USING (true);

-- NOTE: Write access (INSERT, UPDATE, DELETE) is NOT granted to 'anon'.
-- The backend must use the SUPABASE_SERVICE_ROLE_KEY to bypass RLS and write data.
