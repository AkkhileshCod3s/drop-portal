-- dropportal schema — run this once in the Supabase SQL editor.

create table if not exists drops (
  slug                   text primary key,
  files                  jsonb not null,
  total_size             bigint not null,
  password_hash          text,
  expires_at             timestamptz not null,
  download_limit         integer,
  download_count         integer not null default 0,
  delete_after_download  boolean not null default false,
  delete_token           text not null,
  created_at             timestamptz not null default now()
);

create index if not exists drops_expires_at_idx on drops (expires_at);

-- Row level security with no policies: anon/authenticated clients have no
-- access at all. Only the service-role key (used server-side in api/index.py)
-- bypasses RLS and can read or write this table.
alter table drops enable row level security;
