-- ============ إضافة حقل PDF للمذكرات ============
-- يسمح برفع وعرض ملفات PDF مع المذكرات

alter table public.notes
  add column if not exists pdf text not null default '';

-- فهرس للبحث عن المذكرات التي تحتوي PDF
create index if not exists idx_notes_pdf on public.notes(pdf) where pdf <> '';
