alter table public.chat_messages
  drop constraint if exists chat_messages_message_type_check;

alter table public.chat_messages
  add constraint chat_messages_message_type_check
  check (message_type in ('text','image','event_request','event_confirmed','event_declined','system'));

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at);

create index if not exists booking_events_conversation_created_idx
  on public.booking_events (conversation_id, created_at desc);

create index if not exists mover_schedule_events_mover_time_idx
  on public.mover_schedule_events (mover_id, starts_at, ends_at)
  where status <> 'CANCELLED';
