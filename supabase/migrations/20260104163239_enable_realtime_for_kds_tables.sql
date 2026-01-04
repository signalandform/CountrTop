-- =========================
-- Enable Realtime for KDS Tables
-- =========================
-- Adds kitchen_tickets and square_orders to supabase_realtime publication
-- to enable real-time subscriptions for Milestone 7

-- Enable realtime for kitchen_tickets
alter publication supabase_realtime add table public.kitchen_tickets;

-- Enable realtime for square_orders (for potential future use)
alter publication supabase_realtime add table public.square_orders;

