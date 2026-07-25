create table if not exists customer_sessions (
    token       text primary key,
    customer_id text not null references customers(id) on delete cascade,
    created_at  timestamptz not null default now()
);

create index if not exists customer_sessions_customer_id_idx
    on customer_sessions (customer_id);
