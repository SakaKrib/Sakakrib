alter table public.chat_messages
  drop constraint if exists chat_messages_message_type_check;

alter table public.chat_messages
  add constraint chat_messages_message_type_check
  check (message_type in (
    'text',
    'image',
    'booking_request',
    'booking_response',
    'schedule_proposed',
    'schedule_confirmed',
    'event_request',
    'event_confirmed',
    'event_declined',
    'system'
  ));
