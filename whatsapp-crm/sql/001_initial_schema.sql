-- =====================================================
-- WhatsApp CRM - Complete Database Schema
-- Run this in Supabase SQL Editor
-- =====================================================

-- -----------------------------------------------------
-- 1. Enable UUID extension
-- -----------------------------------------------------
create extension if not exists "uuid-ossp";

-- -----------------------------------------------------
-- 2. Create updated_at trigger function
-- -----------------------------------------------------
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- -----------------------------------------------------
-- 3. Contacts table (unified with businesses)
-- -----------------------------------------------------
create table if not exists contacts (
    id uuid primary key default uuid_generate_v4(),
    business_name text not null,
    raw_phone text,
    normalized_phone text not null unique,
    governorate text,
    category text,
    whatsapp_status text check (whatsapp_status in ('pending', 'sent', 'delivered', 'failed', 'replied')),
    whatsapp_sent_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Add indexes for contacts
CREATE INDEX IF NOT EXISTS idx_contacts_normalized_phone ON contacts(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_status ON contacts(whatsapp_status);
CREATE INDEX IF NOT EXISTS idx_contacts_governorate ON contacts(governorate);
CREATE INDEX IF NOT EXISTS idx_contacts_category ON contacts(category);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------
-- 4. Message templates table
-- -----------------------------------------------------
create table if not exists message_templates (
    id uuid primary key default uuid_generate_v4(),
    name text not null unique,
    body text not null,
    template_type text not null default 'text',
    variables jsonb default '[]'::jsonb,
    is_active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_message_templates_updated_at ON message_templates;
CREATE TRIGGER update_message_templates_updated_at
    BEFORE UPDATE ON message_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default templates
INSERT INTO message_templates (name, body, template_type, variables) VALUES
('Strategy A - Direct Link', '{{business_name}} 👋

نُدرج مشروعك في Iraq Compass — أكبر دليل أعمال عراقي مجاني.
يساعد العملاء يلقونك بسهولة على الإنترنت.

أضف مشروعك الآن 👇
https://iraq-compass.pages.dev

يستغرق دقيقتين فقط.
— فريق Iraq Compass', 'text', '["business_name"]')
ON CONFLICT (name) DO NOTHING;

INSERT INTO message_templates (name, body, template_type, variables) VALUES
('Strategy B - Reply Hook (Step 1)', 'مرحباً {{business_name}} 👋

عندنا طريقة تساعد عملاء جدد يلقون مشروعك أونلاين — ومجانية تماماً.

رد بـ نعم وأرسلك التفاصيل 🙂', 'text', '["business_name"]')
ON CONFLICT (name) DO NOTHING;

INSERT INTO message_templates (name, body, template_type, variables) VALUES
('Strategy B - Reply Hook (Step 2)', 'ممتاز! 🎉

Iraq Compass هو دليل الأعمال العراقي الأول.
500+ مشروع مسجل. العملاء يبحثون عنك كل يوم.

سجّل مشروعك مجاناً هنا 👇
https://iraq-compass.pages.dev', 'text', '[]')
ON CONFLICT (name) DO NOTHING;

INSERT INTO message_templates (name, body, template_type, variables) VALUES
('Strategy C - Curiosity Hook', '{{business_name}}، سؤال سريع 🤔

كم عميل جديد تجيبهم من الإنترنت شهرياً؟

معظم الأعمال العراقية تفقد عملاء لأنهم ما يظهرون أونلاين.
لو تبغى تعرف كيف تحل هذا — رد وأخبرك.', 'text', '["business_name"]')
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------
-- 5. Campaigns table
-- -----------------------------------------------------
create table if not exists campaigns (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    status text not null default 'draft' check (status in ('draft', 'running', 'paused', 'completed', 'failed')),
    template_id uuid references message_templates(id),
    message_text text,
    delay_seconds integer default 20,
    total_contacts integer default 0,
    sent_count integer default 0,
    delivered_count integer default 0,
    failed_count integer default 0,
    replied_count integer default 0,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Add indexes for campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_template_id ON campaigns(template_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------
-- 6. Campaign contacts (junction table)
-- -----------------------------------------------------
create table if not exists campaign_contacts (
    id uuid primary key default uuid_generate_v4(),
    campaign_id uuid not null references campaigns(id) on delete cascade,
    contact_id uuid not null references contacts(id) on delete cascade,
    status text default 'pending' check (status in ('pending', 'queued', 'sent', 'delivered', 'failed', 'replied')),
    sent_at timestamptz,
    delivered_at timestamptz,
    failed_at timestamptz,
    error_message text,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique(campaign_id, contact_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_id ON campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_contact_id ON campaign_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_status ON campaign_contacts(status);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_campaign_contacts_updated_at ON campaign_contacts;
CREATE TRIGGER update_campaign_contacts_updated_at
    BEFORE UPDATE ON campaign_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------
-- 7. Messages table (stores all inbound/outbound messages)
-- -----------------------------------------------------
create table if not exists messages (
    id uuid primary key default uuid_generate_v4(),
    contact_id uuid not null references contacts(id) on delete cascade,
    campaign_id uuid references campaigns(id) on delete set null,
    campaign_contact_id uuid references campaign_contacts(id) on delete set null,
    
    -- Message content
    message_text text not null,
    direction text not null check (direction in ('inbound', 'outbound')),
    message_type text default 'text' check (message_type in ('text', 'image', 'document', 'audio', 'video', 'location')),
    
    -- Provider tracking
    provider_message_id text,
    provider_status text,
    
    -- Timestamps
    sent_at timestamptz,
    delivered_at timestamptz,
    read_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Add indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_contact_id ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_campaign_id ON messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_messages_provider_message_id ON messages(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at
    BEFORE UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------
-- 8. Message events table (for webhook events tracking)
-- -----------------------------------------------------
create table if not exists message_events (
    id uuid primary key default uuid_generate_v4(),
    message_id uuid references messages(id) on delete cascade,
    provider_message_id text,
    event_type text not null check (event_type in ('sent', 'delivered', 'read', 'failed', 'received', 'ack')),
    event_data jsonb,
    created_at timestamptz default now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_message_events_message_id ON message_events(message_id);
CREATE INDEX IF NOT EXISTS idx_message_events_provider_message_id ON message_events(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_message_events_event_type ON message_events(event_type);
CREATE INDEX IF NOT EXISTS idx_message_events_created_at ON message_events(created_at);

-- -----------------------------------------------------
-- 9. Webhook logs table (for debugging and audit)
-- -----------------------------------------------------
create table if not exists webhook_logs (
    id uuid primary key default uuid_generate_v4(),
    provider text not null default 'nabda',
    event_type text,
    payload jsonb not null,
    processed boolean default false,
    processing_result jsonb,
    error_message text,
    ip_address text,
    user_agent text,
    created_at timestamptz default now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_webhook_logs_provider ON webhook_logs(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at);

-- -----------------------------------------------------
-- 10. Conversations view (for inbox display)
-- -----------------------------------------------------
create or replace view conversations as
select 
    c.id as contact_id,
    c.business_name,
    c.normalized_phone,
    c.whatsapp_status,
    c.governorate,
    c.category,
    count(m.id) filter (where m.direction = 'inbound') as inbound_count,
    count(m.id) filter (where m.direction = 'outbound') as outbound_count,
    max(m.created_at) as last_message_at,
    (select message_text from messages where contact_id = c.id order by created_at desc limit 1) as last_message_text,
    c.created_at
from contacts c
left join messages m on c.id = m.contact_id
group by c.id, c.business_name, c.normalized_phone, c.whatsapp_status, c.governorate, c.category, c.created_at;

-- -----------------------------------------------------
-- 11. Campaign stats view
-- -----------------------------------------------------
create or replace view campaign_stats as
select 
    c.id as campaign_id,
    c.name as campaign_name,
    c.status,
    c.total_contacts,
    count(cc.id) filter (where cc.status = 'sent') as total_sent,
    count(cc.id) filter (where cc.status = 'delivered') as total_delivered,
    count(cc.id) filter (where cc.status = 'failed') as total_failed,
    count(cc.id) filter (where cc.status = 'replied') as total_replied,
    count(cc.id) filter (where cc.status = 'pending') as total_pending,
    round(
        case when count(cc.id) filter (where cc.status in ('sent', 'delivered', 'replied')) > 0 
        then count(cc.id) filter (where cc.status in ('delivered', 'replied'))::numeric / 
             count(cc.id) filter (where cc.status in ('sent', 'delivered', 'replied'))::numeric * 100
        else 0
        end, 2
    ) as delivery_rate,
    c.started_at,
    c.completed_at,
    c.created_at
from campaigns c
left join campaign_contacts cc on c.id = cc.campaign_id
group by c.id, c.name, c.status, c.total_contacts, c.started_at, c.completed_at, c.created_at;

-- -----------------------------------------------------
-- 12. Enable Row Level Security (RLS) - optional but recommended
-- -----------------------------------------------------
alter table contacts enable row level security;
alter table message_templates enable row level security;
alter table campaigns enable row level security;
alter table campaign_contacts enable row level security;
alter table messages enable row level security;
alter table message_events enable row level security;
alter table webhook_logs enable row level security;

-- Create policies for authenticated users (adjust as needed)
create policy "Allow all" on contacts for all using (true);
create policy "Allow all" on message_templates for all using (true);
create policy "Allow all" on campaigns for all using (true);
create policy "Allow all" on campaign_contacts for all using (true);
create policy "Allow all" on messages for all using (true);
create policy "Allow all" on message_events for all using (true);
create policy "Allow all" on webhook_logs for all using (true);

-- -----------------------------------------------------
-- 13. Verification query
-- -----------------------------------------------------
select 
    'Tables created successfully' as status,
    (select count(*) from information_schema.tables where table_schema = 'public' and table_name in (
        'contacts', 'message_templates', 'campaigns', 'campaign_contacts', 'messages', 'message_events', 'webhook_logs'
    )) as table_count;
