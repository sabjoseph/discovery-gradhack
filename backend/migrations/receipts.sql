-- Receipt storage for the "Add Purchase" OCR flow.
-- Run this in the Supabase SQL editor. Until it runs, the backend falls back
-- to storing receipt metadata in activity_log, so nothing breaks either way.

create table if not exists receipts (
  id bigint generated always as identity primary key,
  customer_id text not null,
  basket_id text not null references baskets (id),
  image_path text not null,
  image_url text,
  ocr_text text,
  ocr_draft jsonb,
  ocr_provider text,
  created_at timestamptz not null default now()
);

create index if not exists receipts_basket_idx on receipts (basket_id);
create index if not exists receipts_customer_idx on receipts (customer_id);

-- The "receipts" storage bucket is created automatically by the backend on
-- first upload (public bucket, 10MB file limit).
