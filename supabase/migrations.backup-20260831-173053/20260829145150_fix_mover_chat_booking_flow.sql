-- Fix mover chat authorization and canonical booking/schedule flow.
-- Canonical conversation id is the deterministic renter/mover user pair.

revoke all on table public.chat_messages from anon;
grant select, insert on table public.chat_messages to authenticated;

drop policy if exists insert_own_chat_messages on public.chat_messages;
create policy insert_own_chat_messages
on public.chat_messages
for insert
to authenticated
with check (
  (select auth.uid()) = sender_id
  and conversation_id = ((least(sender_id, receiver_id))::text || '__'::text || (greatest(sender_id, receiver_id))::text)
  and (
    (
      exists (select 1 from public.profiles sender_profile where sender_profile.id=sender_id and sender_profile.role='renter')
      and exists (select 1 from public.movers receiver_mover where receiver_mover.user_id=receiver_id and receiver_mover.approval_status='approved')
    )
    or
    (
      exists (select 1 from public.movers sender_mover where sender_mover.user_id=sender_id and sender_mover.approval_status='approved')
      and exists (select 1 from public.profiles receiver_profile where receiver_profile.id=receiver_id and receiver_profile.role='renter')
    )
  )
);

drop policy if exists select_own_chat_messages on public.chat_messages;
create policy select_own_chat_messages
on public.chat_messages
for select
to authenticated
using ((select auth.uid())=sender_id or (select auth.uid())=receiver_id);

-- Booking responses are written into the same canonical conversation as normal chat.
create or replace function public.respond_to_mover_booking(p_booking_id uuid,p_decision text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=(select auth.uid()); v_b public.bookings%rowtype; v_conversation text;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if p_decision not in ('confirm','not_sure','cancel') then raise exception 'Invalid decision'; end if;
 select b.* into v_b from public.bookings b join public.movers m on m.id=b.mover_id where b.id=p_booking_id and m.user_id=v_uid for update;
 if not found then raise exception 'Booking not found or unauthorized'; end if;
 if v_b.status<>'pending' then raise exception 'Booking is no longer awaiting mover response'; end if;
 if coalesce(v_b.request_expires_at,v_b.requested_at+interval '30 minutes')<now() then
   update public.bookings set status='cancelled',cancelled_at=now(),cancellation_reason='MOVER_TAKING_TOO_LONG',updated_at=now() where id=p_booking_id;
   raise exception 'The 30-minute response window has expired';
 end if;
 v_conversation:=((least(v_b.renter_id,v_uid))::text||'__'||(greatest(v_b.renter_id,v_uid))::text);
 if p_decision='confirm' then
   update public.bookings set status='confirmed',confirmed_at=now(),updated_at=now() where id=p_booking_id;
   insert into public.chat_messages(conversation_id,sender_id,receiver_id,content,message_type,event_data)
   values(v_conversation,v_uid,v_b.renter_id,'The mover has accepted your request. Please select a moving date and time.','booking_response',jsonb_build_object('booking_id',p_booking_id,'decision','confirm'));
   insert into public.user_notifications(user_id,notification_type,title,message,data)
   values(v_b.renter_id,'MOVER_CONFIRMED','Mover confirmed your request','Your selected mover accepted the request. Choose a date and time in chat.',jsonb_build_object('booking_id',p_booking_id));
 elsif p_decision='not_sure' then
   if p_reason is null or btrim(p_reason)='' then raise exception 'Reason is required for not sure'; end if;
   insert into public.chat_messages(conversation_id,sender_id,receiver_id,content,message_type,event_data)
   values(v_conversation,v_uid,v_b.renter_id,'The mover is not sure about this request yet: '||p_reason,'booking_response',jsonb_build_object('booking_id',p_booking_id,'decision','not_sure','reason',p_reason));
   insert into public.user_notifications(user_id,notification_type,title,message,data)
   values(v_b.renter_id,'MOVER_NOT_SURE','Mover is not sure','The mover needs more discussion before confirming.',jsonb_build_object('booking_id',p_booking_id,'reason',p_reason));
 else
   if p_reason is null or btrim(p_reason)='' then raise exception 'Reason is required for cancellation'; end if;
   update public.bookings set status='cancelled',cancelled_at=now(),cancellation_reason='MOVER_DECLINED',cancellation_details=p_reason,updated_at=now() where id=p_booking_id;
   insert into public.moving_cancellation_events(booking_id,cancelled_by,reason_code,reason_text) values(p_booking_id,v_uid,'MOVER_CANCELLED',p_reason);
   insert into public.chat_messages(conversation_id,sender_id,receiver_id,content,message_type,event_data)
   values(v_conversation,v_uid,v_b.renter_id,'The mover cancelled the request: '||p_reason,'booking_response',jsonb_build_object('booking_id',p_booking_id,'decision','cancel','reason',p_reason));
   insert into public.user_notifications(user_id,notification_type,title,message,data)
   values(v_b.renter_id,'MOVER_CANCELLED','Mover cancelled the request','The mover cancelled your moving request.',jsonb_build_object('booking_id',p_booking_id,'reason',p_reason));
 end if;
 return jsonb_build_object('booking_id',p_booking_id,'decision',p_decision,'status',(select status from public.bookings where id=p_booking_id));
end; $$;

-- Schedule proposal stays tentative; only mover confirmation populates booking.scheduled_*.
create or replace function public.propose_moving_schedule(p_booking_id uuid,p_starts_at timestamptz,p_ends_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=(select auth.uid()); v_b public.bookings%rowtype; v_m public.movers%rowtype; v_day text; v_start_time time; v_end_time time;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if p_ends_at<=p_starts_at then raise exception 'End time must be after start time'; end if;
 if p_starts_at<=now() then raise exception 'Moving time must be in the future'; end if;
 select b.* into v_b from public.bookings b where b.id=p_booking_id and b.renter_id=v_uid for update;
 if not found then raise exception 'Booking not found or unauthorized'; end if;
 if v_b.status<>'confirmed' then raise exception 'Mover must confirm before scheduling'; end if;
 if v_b.scheduled_start_at is not null or v_b.scheduled_end_at is not null then raise exception 'A moving schedule is already confirmed'; end if;
 select * into v_m from public.movers where id=v_b.mover_id for update;
 if not found then raise exception 'Mover not found'; end if;
 v_day:=lower(public.moving_day_name(p_starts_at at time zone 'Africa/Nairobi'));
 v_start_time:=(p_starts_at at time zone 'Africa/Nairobi')::time;
 v_end_time:=(p_ends_at at time zone 'Africa/Nairobi')::time;
 if v_m.working_days is not null and not exists(select 1 from unnest(v_m.working_days) d where lower(trim(d))=v_day) then raise exception 'Mover does not work on %',v_day; end if;
 if v_m.start_time is not null and v_start_time<v_m.start_time then raise exception 'Start time is outside mover working hours'; end if;
 if v_m.end_time is not null and v_end_time>v_m.end_time then raise exception 'End time is outside mover working hours'; end if;
 if exists(select 1 from public.mover_schedule_events e where e.mover_id=v_b.mover_id and e.booking_id<>p_booking_id and e.status in ('TENTATIVE','CONFIRMED') and tstzrange(e.starts_at,e.ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)')) then raise exception 'Mover already has another scheduled job at that time'; end if;
 insert into public.mover_schedule_events(mover_id,booking_id,starts_at,ends_at,status,title) values(v_b.mover_id,p_booking_id,p_starts_at,p_ends_at,'TENTATIVE','Moving service')
 on conflict(booking_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,status='TENTATIVE',updated_at=now();
 return jsonb_build_object('booking_id',p_booking_id,'starts_at',p_starts_at,'ends_at',p_ends_at,'status','TENTATIVE');
end; $$;

create or replace function public.confirm_moving_schedule(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=(select auth.uid()); v_b public.bookings%rowtype; v_event public.mover_schedule_events%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select b.* into v_b from public.bookings b join public.movers m on m.id=b.mover_id where b.id=p_booking_id and m.user_id=v_uid for update;
 if not found then raise exception 'Booking not found or unauthorized'; end if;
 if v_b.status<>'confirmed' then raise exception 'Booking must be confirmed before scheduling'; end if;
 select * into v_event from public.mover_schedule_events where booking_id=p_booking_id for update;
 if not found then raise exception 'No schedule proposal exists'; end if;
 if v_event.status<>'TENTATIVE' then raise exception 'Schedule is no longer awaiting confirmation'; end if;
 if v_event.starts_at<=now() then raise exception 'Schedule is in the past'; end if;
 if v_event.ends_at<=v_event.starts_at then raise exception 'Invalid schedule duration'; end if;
 if exists(select 1 from public.mover_schedule_events e where e.mover_id=v_b.mover_id and e.booking_id<>p_booking_id and e.status='CONFIRMED' and tstzrange(e.starts_at,e.ends_at,'[)') && tstzrange(v_event.starts_at,v_event.ends_at,'[)')) then raise exception 'Mover already has another scheduled job at that time'; end if;
 update public.mover_schedule_events set status='CONFIRMED',updated_at=now() where id=v_event.id;
 update public.bookings set scheduled_start_at=v_event.starts_at,scheduled_end_at=v_event.ends_at,updated_at=now() where id=p_booking_id;
 return jsonb_build_object('booking_id',p_booking_id,'status','CONFIRMED','starts_at',v_event.starts_at,'ends_at',v_event.ends_at);
end; $$;

revoke execute on function public.respond_to_mover_booking(uuid,text,text) from public,anon;
revoke execute on function public.propose_moving_schedule(uuid,timestamptz,timestamptz) from public,anon;
revoke execute on function public.confirm_moving_schedule(uuid) from public,anon;
grant execute on function public.respond_to_mover_booking(uuid,text,text) to authenticated;
grant execute on function public.propose_moving_schedule(uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.confirm_moving_schedule(uuid) to authenticated;

create index if not exists chat_messages_conversation_created_desc_idx on public.chat_messages(conversation_id,created_at desc);
create index if not exists chat_messages_sender_receiver_idx on public.chat_messages(sender_id,receiver_id);
alter table public.chat_messages replica identity full;
alter table public.bookings replica identity full;
alter table public.mover_schedule_events replica identity full;
