-- Run once in Supabase: SQL Editor > New query > Run. Safe to run again.


create sequence if not exists request_number_seq;


-- Accounts

create table if not exists accounts (

    id               bigint generated always as identity primary key,

    role             text not null check (role in ('resident', 'staff')),
    name             text not null,

    email            text not null
                     check (email = lower(email))
                     check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

    password_hash    text not null,
    address          text,
    contact          text,

    reset_code_hash  text,
    reset_expires_at timestamptz,

    created_at       timestamptz not null default now()

);

-- One account per email, ignoring upper/lower case
create unique index if not exists accounts_email_unique
    on accounts (lower(email));


-- Adds the email checks when the table already existed without them

do $$
begin

    if not exists (
        select 1 from pg_constraint
        where conrelid = 'accounts'::regclass
        and conname = 'accounts_email_lowercase'
    ) then
        alter table accounts
            add constraint accounts_email_lowercase
            check (email = lower(email)) not valid;
    end if;

    if not exists (
        select 1 from pg_constraint
        where conrelid = 'accounts'::regclass
        and conname = 'accounts_email_format'
    ) then
        alter table accounts
            add constraint accounts_email_format
            check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') not valid;
    end if;

end $$;


-- Requests

create table if not exists requests (

    id             bigint generated always as identity primary key,

    request_no     text not null unique default (
        'BR-' || to_char(now(), 'YYYY') || '-' ||
        lpad(nextval('request_number_seq')::text, 5, '0')
    ),

    resident_id    bigint not null references accounts (id) on delete cascade,

    document_type  text not null check (document_type in (
        'Barangay Clearance',
        'Barangay Certificate',
        'Certificate of Indigency',
        'Certificate of Residency',
        'Business Clearance',
        'Other'
    )),

    purpose        text not null,

    release_method text not null check (release_method in (
        'Digital Copy',
        'Physical Copy'
    )),

    status         text not null default 'Pending' check (status in (
        'Pending',
        'Processing',
        'Ready for Release',
        'Completed',
        'Rejected'
    )),

    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()

);

create index if not exists requests_resident_idx on requests (resident_id);
create index if not exists requests_status_idx   on requests (status);


-- Refreshes updated_at on every change to a request

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin

    new.updated_at = now();
    return new;

end;
$$;

drop trigger if exists requests_set_updated_at on requests;

create trigger requests_set_updated_at
    before update on requests
    for each row
    execute function set_updated_at();


-- Email Log

create table if not exists email_log (

    id           bigint generated always as identity primary key,

    account_id   bigint references accounts (id) on delete set null,
    request_id   bigint references requests (id) on delete set null,

    to_email     text not null,
    kind         text not null check (kind in (
        'password_reset',
        'request_received',
        'status_update'
    )),
    subject      text not null,

    status       text not null default 'queued' check (status in (
        'queued',
        'sent',
        'failed'
    )),
    error        text,

    created_at   timestamptz not null default now(),
    sent_at      timestamptz

);

create index if not exists email_log_account_idx on email_log (account_id);
create index if not exists email_log_request_idx on email_log (request_id);


-- Security

alter table accounts  enable row level security;
alter table requests  enable row level security;
alter table email_log enable row level security;

revoke all on table accounts  from anon, authenticated;
revoke all on table requests  from anon, authenticated;
revoke all on table email_log from anon, authenticated;
