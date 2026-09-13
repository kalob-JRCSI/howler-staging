create table if not exists drawing_shares (
  token text primary key,
  snapshot jsonb not null,
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists drawing_shares_expires_idx on drawing_shares (expires_at);
