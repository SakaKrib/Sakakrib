


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."add_listing_to_pms"("p_subscription_id" "uuid", "p_listing_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_role text;
    v_landlord_id uuid;
    v_subscription_status text;
    v_max_listings integer;
    v_plan_name text;
    v_listing_owner uuid;
    v_current_count integer;
    v_existing_status text;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;

    select role into v_role from public.profiles where id = auth.uid();
    if v_role is distinct from 'landlord' then
        raise exception 'PMS is currently available only to landlord accounts';
    end if;

    select ls.landlord_id, ls.status, sp.max_listings, sp.name
    into v_landlord_id, v_subscription_status, v_max_listings, v_plan_name
    from public.landlord_subscriptions ls
    join public.subscription_plans sp on sp.id = ls.plan_id
    where ls.id = p_subscription_id and ls.landlord_id = auth.uid()
    limit 1;

    if v_landlord_id is null then raise exception 'Subscription not found or not owned by current user'; end if;
    if v_subscription_status not in ('ACTIVE', 'GRACE_PERIOD') then raise exception 'PMS subscription is not active'; end if;

    select l.user_id into v_listing_owner from public.listings l where l.id = p_listing_id limit 1;
    if v_listing_owner is null then raise exception 'Listing not found'; end if;
    if v_listing_owner <> auth.uid() then raise exception 'You cannot add another landlord''s listing to your PMS'; end if;

    select sl.status into v_existing_status
    from public.subscription_listings sl
    where sl.subscription_id = p_subscription_id and sl.listing_id = p_listing_id
    limit 1;

    if v_existing_status = 'ACTIVE' then raise exception 'Listing is already managed by this PMS subscription'; end if;

    select count(*)::integer into v_current_count
    from public.subscription_listings sl
    where sl.subscription_id = p_subscription_id and sl.status = 'ACTIVE';

    if v_max_listings is not null and v_current_count >= v_max_listings then
        raise exception 'Your % PMS plan supports a maximum of % managed listings. Please upgrade your PMS plan.', v_plan_name, v_max_listings;
    end if;

    if v_existing_status = 'INACTIVE' then
        update public.subscription_listings
        set status = 'ACTIVE', activated_at = now(), deactivated_at = null
        where subscription_id = p_subscription_id and listing_id = p_listing_id;
    else
        insert into public.subscription_listings (subscription_id, listing_id, status, activated_at)
        values (p_subscription_id, p_listing_id, 'ACTIVE', now());
    end if;

    return jsonb_build_object('success', true, 'subscription_id', p_subscription_id,
        'listing_id', p_listing_id, 'plan', v_plan_name,
        'managed_listings', v_current_count + 1, 'max_listings', v_max_listings);
end;
$$;


ALTER FUNCTION "public"."add_listing_to_pms"("p_subscription_id" "uuid", "p_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_release_escrow"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
 v_uid uuid:=auth.uid(); v_b public.bookings%rowtype; v_payout public.mover_payouts%rowtype; v_mover_user uuid; v_released integer:=0; v_now timestamptz:=now(); v_resolution text;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.profiles p where p.id=v_uid and p.role='admin') then raise exception 'Admin authorization required'; end if;
 select * into v_b from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'Booking not found'; end if;
 if v_b.status='cancelled' then raise exception 'Cancelled booking cannot be released'; end if;
 if v_b.payment_status<>'paid' then raise exception 'Renter payment is not settled'; end if;
 if v_b.dispute_status='OPEN' then raise exception 'Escrow release blocked while dispute is open'; end if;
 if v_b.renter_confirmed_delivery_at is null or v_b.mover_confirmed_delivery_at is null then raise exception 'Both renter and mover must confirm safe delivery'; end if;
 if v_b.dispute_status='RESOLVED' then
   select d.resolution_code into v_resolution from public.moving_disputes d where d.booking_id=p_booking_id and d.status='RESOLVED' order by d.resolved_at desc nulls last limit 1;
   if v_resolution is distinct from 'RELEASE_TO_MOVER' then raise exception 'Resolved dispute does not authorize mover payout'; end if;
 end if;
 select * into v_payout from public.mover_payouts where booking_id=p_booking_id for update;
 if not found then raise exception 'Mover payout record not found'; end if;
 if v_payout.final_payment_status='released' then return jsonb_build_object('booking_id',p_booking_id,'status','released','escrow_released',true,'already_processed',true,'mover_net_payable',v_payout.net_mover_payable); end if;
 if v_payout.final_payment_status not in ('held','failed') then raise exception 'Final escrow is not available for release'; end if;
 update public.moving_payments set status='RELEASED',released_at=coalesce(released_at,v_now),updated_at=v_now where booking_id=p_booking_id and status='HELD';
 get diagnostics v_released=row_count;
 update public.mover_payouts set final_payment_status='processing',final_payment_released_at=coalesce(final_payment_released_at,v_now),delivery_confirmed_at=coalesce(delivery_confirmed_at,v_now),payout_requested_at=coalesce(payout_requested_at,v_now),payout_failure_reason=null,updated_at=v_now where id=v_payout.id;
 update public.moving_invoices set status='RELEASED',released_at=coalesce(released_at,v_now),updated_at=v_now where booking_id=p_booking_id;
 select m.user_id into v_mover_user from public.movers m where m.id=v_b.mover_id;
 if v_mover_user is null then raise exception 'Mover account not found'; end if;
 return jsonb_build_object('booking_id',p_booking_id,'status','PAYOUT_PROCESSING','escrow_released',true,'payments_released',v_released,'mover_net_payable',v_payout.net_mover_payable,'payout_id',v_payout.id,'payout_status','processing','next_step','PAYOUT_PROVIDER_CALLBACK');
end; $$;


ALTER FUNCTION "public"."admin_release_escrow"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_release_mover_payout"("p_payout_id" "uuid", "p_tranche" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  v_booking_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then raise exception 'Admin authorization required'; end if;
  if p_tranche <> 'final_payment' then raise exception 'Only final escrow release is permitted'; end if;
  select booking_id into v_booking_id from public.mover_payouts where id = p_payout_id for update;
  if v_booking_id is null then raise exception 'Payout not found'; end if;
  v_result := public.admin_release_escrow(v_booking_id);
end;
$$;


ALTER FUNCTION "public"."admin_release_mover_payout"("p_payout_id" "uuid", "p_tranche" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_landlord_application"("p_user_id" "uuid", "p_decision" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
UPDATE profiles SET landlord_application_status = p_decision, role = CASE WHEN p_decision = 'approved' THEN 'landlord' ELSE role END
WHERE id = p_user_id AND role = 'renter' AND landlord_application_status = 'pending';
END;
$$;


ALTER FUNCTION "public"."admin_review_landlord_application"("p_user_id" "uuid", "p_decision" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_listing"("p_listing_id" "uuid", "p_decision" "text", "p_note" "text" DEFAULT ''::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
RAISE EXCEPTION 'Not authorized';
END IF;
IF p_decision NOT IN ('approved','rejected') THEN
RAISE EXCEPTION 'Invalid decision';
END IF;
UPDATE listings SET
approval_status = p_decision,
is_published = (p_decision = 'approved'),
admin_reviewed_at = now(),
admin_review_note = COALESCE(p_note, '')
WHERE id = p_listing_id;
END;
$$;


ALTER FUNCTION "public"."admin_review_listing"("p_listing_id" "uuid", "p_decision" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_mover_application"("p_user_id" "uuid", "p_decision" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
UPDATE profiles SET mover_application_status = p_decision, role = CASE WHEN p_decision = 'approved' THEN 'mover' ELSE role END
WHERE id = p_user_id AND role = 'renter' AND mover_application_status = 'pending';
UPDATE movers SET approval_status = p_decision, is_available = (p_decision = 'approved')
WHERE user_id = p_user_id AND approval_status = 'pending_review';
END;
$$;


ALTER FUNCTION "public"."admin_review_mover_application"("p_user_id" "uuid", "p_decision" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."build_email_html"("p_title" "text", "p_body" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
BEGIN
RETURN '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>' || p_title || '</title></head><body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Helvetica Neue,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#0f766e,#115e59);padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.5px;">Saka Krib</h1>
<p style="margin:4px 0 0;color:#a7f3d0;font-size:13px;">Kenya''s Trusted Housing Platform</p>
</td></tr>
<!-- Body -->
<tr><td style="padding:32px 40px;">
<h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;font-weight:600;">' || p_title || '</h2>
<div style="color:#475569;font-size:15px;line-height:1.6;">' || p_body || '</div>
</td></tr>
<!-- Footer -->
<tr><td style="background-color:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
<p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.5;">
&copy; 2026 Saka Krib. All rights reserved.<br/>
This is an automated message. Please do not reply to this email.
</p>
</td></tr>
</table>
</td></tr>
</table></body></html>';
END;
$$;


ALTER FUNCTION "public"."build_email_html"("p_title" "text", "p_body" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_mover_quote"("p_mover_id" "uuid", "p_distance_km" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
declare v_rate numeric; v_base numeric; v_total numeric; v_fee numeric; v_net numeric; v_commission numeric;
begin
 if p_distance_km is null or p_distance_km < 0 then raise exception 'Distance must be zero or greater'; end if;
 select coalesce(rate_per_km_kes,0),coalesce(base_rate_kes,0) into v_rate,v_base from public.movers where id=p_mover_id and approval_status='approved' and is_available=true;
 if not found then raise exception 'Mover is not approved, unavailable, or does not exist'; end if;
 select coalesce(mover_commission_rate,0.20) into v_commission from public.platform_settings where id=true;
 v_total:=round(v_base+(v_rate*p_distance_km),2); v_fee:=round(v_total*v_commission,2); v_net:=round(v_total-v_fee,2);
 return jsonb_build_object('mover_id',p_mover_id,'distance_km',round(p_distance_km,2),'base_rate_kes',v_base,'rate_per_km_kes',v_rate,'renter_total_kes',v_total,'platform_fee_kes',v_fee,'platform_commission_rate',v_commission,'mover_net_kes',v_net);
end;$$;


ALTER FUNCTION "public"."calculate_mover_quote"("p_mover_id" "uuid", "p_distance_km" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_pms"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$

declare
    caller_role text;
    subscription_status text;
    period_end timestamptz;
    grace_end timestamptz;

begin
    if auth.uid() is null then
        return false;
    end if;

    select role
    into caller_role
    from public.profiles
    where id = auth.uid();

    if caller_role is null then
        return false;
    end if;

    if caller_role = 'landlord' then

        select status, current_period_end, grace_period_end
        into subscription_status, period_end, grace_end
        from public.landlord_subscriptions
        where landlord_id = auth.uid()
        order by created_at desc
        limit 1;

        if not found then
            return false;
        end if;

        if subscription_status = 'ACTIVE' and period_end > now() then
            return true;
        end if;

        if subscription_status = 'GRACE_PERIOD'
           and grace_end is not null
           and grace_end > now()
        then
            return true;
        end if;

        return false;

    end if;

    if caller_role = 'real_estate' then

        select status, current_period_end, grace_period_end
        into subscription_status, period_end, grace_end
        from public.real_estate_subscriptions
        where real_estate_id = auth.uid()
        order by created_at desc
        limit 1;

        if not found then
            return false;
        end if;

        if subscription_status = 'ACTIVE' and period_end > now() then
            return true;
        end if;

        if subscription_status = 'GRACE_PERIOD'
           and grace_end is not null
           and grace_end > now()
        then
            return true;
        end if;

        return false;

    end if;

    return false;

end;

$$;


ALTER FUNCTION "public"."can_manage_pms"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_pms_listing"("p_listing_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_user_id uuid := auth.uid();
    v_subscription_status text;
    v_is_managed boolean;
begin

    if v_user_id is null then
        return false;
    end if;

    /*
     * --------------------------------------------------------
     * FIND ACTIVE PMS SUBSCRIPTION
     * --------------------------------------------------------
     *
     * GRACE_PERIOD still allows PMS management.
     */

    select ls.status
    into v_subscription_status
    from public.landlord_subscriptions ls
    where ls.landlord_id = v_user_id
      and ls.status in (
          'ACTIVE',
          'GRACE_PERIOD'
      )
    order by ls.updated_at desc
    limit 1;

    if v_subscription_status is null then
        return false;
    end if;


    /*
     * --------------------------------------------------------
     * CHECK SPECIFIC LISTING
     * --------------------------------------------------------
     */

    select exists (
        select 1
        from public.subscription_listings sl
        where sl.subscription_id = (
            select ls.id
            from public.landlord_subscriptions ls
            where ls.landlord_id = v_user_id
              and ls.status in (
                  'ACTIVE',
                  'GRACE_PERIOD'
              )
            order by ls.updated_at desc
            limit 1
        )
        and sl.listing_id = p_listing_id
        and sl.status = 'ACTIVE'
        and exists (
            select 1
            from public.listings l
            where l.id = sl.listing_id
              and l.user_id = v_user_id
        )
    )
    into v_is_managed;

    return coalesce(v_is_managed, false);

end;
$$;


ALTER FUNCTION "public"."can_manage_pms_listing"("p_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_moving_booking"("p_booking_id" "uuid", "p_reason_code" "text", "p_reason_text" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid:=auth.uid(); v_b public.bookings%rowtype; v_mover_user uuid; v_actor text; v_event_key text;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if p_reason_code not in ('MOVER_DID_NOT_CONFIRM','MOVER_TAKING_TOO_LONG','CHANGED_MIND','OTHER','RENTER_CANCELLED','MOVER_CANCELLED','MOVER_UNAVAILABLE') then raise exception 'Invalid cancellation reason'; end if;
 select b.* into v_b from public.bookings b where b.id=p_booking_id for update;
 if not found then raise exception 'Booking not found'; end if;
 select m.user_id into v_mover_user from public.movers m where m.id=v_b.mover_id;
 if v_b.renter_id=v_uid then v_actor:='RENTER';
 elsif v_mover_user=v_uid then v_actor:='MOVER';
 else raise exception 'Booking not found or unauthorized'; end if;
 if v_actor='RENTER' and p_reason_code in ('MOVER_CANCELLED','MOVER_UNAVAILABLE') then raise exception 'Invalid renter cancellation reason'; end if;
 if v_actor='MOVER' and p_reason_code in ('MOVER_DID_NOT_CONFIRM','MOVER_TAKING_TOO_LONG','CHANGED_MIND') then raise exception 'Invalid mover cancellation reason'; end if;
 if v_b.status in ('cancelled','completed') then return jsonb_build_object('booking_id',p_booking_id,'status',v_b.status,'already_final',true); end if;
 if v_b.status not in ('pending','confirmed') then raise exception 'Booking cannot be cancelled after the journey has started'; end if;
 if v_b.payment_status not in ('unpaid','pending','failed') then raise exception 'Paid booking requires the payment/refund flow and cannot be cancelled here'; end if;
 update public.bookings set status='cancelled',cancelled_at=now(),cancellation_reason=p_reason_code,cancellation_details=left(p_reason_text,2000),updated_at=now() where id=p_booking_id;
 update public.mover_schedule_events set status='CANCELLED',updated_at=now() where booking_id=p_booking_id and status in ('TENTATIVE','CONFIRMED');
 insert into public.moving_cancellation_events(booking_id,cancelled_by,reason_code,reason_text) values(p_booking_id,v_uid,p_reason_code,p_reason_text);
 v_event_key:='moving_cancelled:'||p_booking_id::text||':'||v_actor;
 perform public.dispatch_user_notification(case when v_actor='RENTER' then v_mover_user else v_b.renter_id end,'MOVING_CANCELLED','Moving booking cancelled',case when v_actor='RENTER' then 'The renter cancelled the moving booking.' else 'The mover cancelled the moving booking.' end,jsonb_build_object('booking_id',p_booking_id,'reason_code',p_reason_code),v_event_key,true,'moving_cancelled');
 return jsonb_build_object('booking_id',p_booking_id,'status','cancelled','cancelled_by',v_actor);
end; $$;


ALTER FUNCTION "public"."cancel_moving_booking"("p_booking_id" "uuid", "p_reason_code" "text", "p_reason_text" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."renter_unit_associations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "landlord_id" "uuid" NOT NULL,
    "renter_name" "text" NOT NULL,
    "renter_phone" "text",
    "renter_email" "text",
    "rent_amount" numeric NOT NULL,
    "lease_start" "date",
    "lease_end" "date",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "renter_user_id" "uuid",
    "invite_token_hash" "text",
    "invited_at" timestamp with time zone DEFAULT "now"(),
    "invite_expires_at" timestamp with time zone,
    "claimed_at" timestamp with time zone,
    CONSTRAINT "renter_unit_associations_status_check" CHECK (("upper"("status") = ANY (ARRAY['ACTIVE'::"text", 'INACTIVE'::"text", 'ENDED'::"text", 'PENDING'::"text"])))
);


ALTER TABLE "public"."renter_unit_associations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."renter_unit_associations"."renter_user_id" IS 'Authenticated renter profile linked to this unit association.';



CREATE OR REPLACE FUNCTION "public"."claim_renter_invitation"("p_token" "text") RETURNS "public"."renter_unit_associations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user uuid := auth.uid();
  v_hash text := encode(digest(p_token, 'sha256'), 'hex');
  v_row public.renter_unit_associations;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.renter_unit_associations
  set renter_user_id = v_user,
      status = 'ACTIVE',
      claimed_at = now(),
      updated_at = now()
  where invite_token_hash = v_hash
    and status = 'PENDING'
    and renter_user_id is null
    and (invite_expires_at is null or invite_expires_at > now())
  returning * into v_row;

  if not found then
    raise exception 'This invitation is invalid, expired, already claimed, or no longer available';
  end if;

  insert into public.user_notifications (
    user_id, notification_type, title, message, data
  ) values (
    v_row.landlord_id,
    'RENTER_CLAIMED_UNIT',
    'Rental claimed',
    v_row.renter_name || ' has successfully claimed their rental.',
    jsonb_build_object('association_id', v_row.id, 'unit_id', v_row.unit_id)
  );

  return v_row;
end;
$$;


ALTER FUNCTION "public"."claim_renter_invitation"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_unverified_profiles"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_count integer := 0;
begin
  /*
   * Delete the entire Auth account only after the fixed three-minute
   * registration verification window has expired and the application
   * profile is still unverified.
   *
   * Deleting auth.users is intentional: the existing FK/cascade removes
   * the corresponding profile and dependent application records according
   * to the database's existing relationships.
   */
  delete from auth.users u
  where exists (
    select 1
    from public.profiles p
    where p.id = u.id
      and coalesce(p.email_verified, false) = false
      and p.signup_verification_deadline_at is not null
      and p.signup_verification_deadline_at <= now()
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."cleanup_expired_unverified_profiles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_moving_delivery"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid:=auth.uid(); v_b public.bookings%rowtype; v_mover_user uuid; v_mover_profile uuid; v_already_confirmed boolean:=false; v_both boolean:=false;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select b.* into v_b from public.bookings b where b.id=p_booking_id and (b.renter_id=v_uid or exists(select 1 from public.movers m where m.id=b.mover_id and m.user_id=v_uid)) for update;
 if not found then raise exception 'Booking not found or unauthorized'; end if;
 if v_b.payment_status <> 'paid' then raise exception 'Booking must be paid before delivery confirmation'; end if;
 if v_b.status not in ('in_progress','completed') then raise exception 'Journey must be active or completed before delivery confirmation'; end if;
 select m.user_id,m.id into v_mover_user,v_mover_profile from public.movers m where m.id=v_b.mover_id;
 if v_b.renter_id=v_uid then
   v_already_confirmed:=v_b.renter_confirmed_delivery_at is not null;
   if not v_already_confirmed then update public.bookings set renter_confirmed_delivery_at=now(),updated_at=now() where id=p_booking_id returning * into v_b; end if;
 else
   v_already_confirmed:=v_b.mover_confirmed_delivery_at is not null;
   if not v_already_confirmed then update public.bookings set mover_confirmed_delivery_at=now(),updated_at=now() where id=p_booking_id returning * into v_b; end if;
 end if;
 v_both:=v_b.renter_confirmed_delivery_at is not null and v_b.mover_confirmed_delivery_at is not null;
 if v_both and v_b.status='in_progress' then update public.bookings set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now() where id=p_booking_id returning * into v_b; end if;
 return jsonb_build_object('booking_id',p_booking_id,'renter_confirmed',v_b.renter_confirmed_delivery_at is not null,'mover_confirmed',v_b.mover_confirmed_delivery_at is not null,'both_confirmed',v_both,'status',v_b.status,'already_confirmed',v_already_confirmed);
end; $$;


ALTER FUNCTION "public"."confirm_moving_delivery"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_moving_schedule"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_b public.bookings%rowtype;
  v_event public.mover_schedule_events%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select b.* into v_b
  from public.bookings b
  join public.movers m on m.id=b.mover_id
  where b.id=p_booking_id and m.user_id=v_uid
  for update;

  if not found then raise exception 'Booking not found or unauthorized'; end if;
  if v_b.status <> 'confirmed' then raise exception 'Booking must be confirmed before scheduling'; end if;

  select * into v_event
  from public.mover_schedule_events
  where booking_id=p_booking_id
  for update;

  if not found then raise exception 'No schedule proposal exists'; end if;
  if v_event.status <> 'TENTATIVE' then raise exception 'Schedule is no longer awaiting confirmation'; end if;
  if v_event.starts_at <= now() then raise exception 'Schedule is in the past'; end if;
  if v_event.ends_at <= v_event.starts_at then raise exception 'Invalid schedule duration'; end if;

  if exists(
    select 1 from public.mover_schedule_events e
    where e.mover_id=v_b.mover_id
      and e.booking_id<>p_booking_id
      and e.status='CONFIRMED'
      and tstzrange(e.starts_at,e.ends_at,'[)') && tstzrange(v_event.starts_at,v_event.ends_at,'[)')
  ) then
    raise exception 'Mover already has another scheduled job at that time';
  end if;

  update public.mover_schedule_events
  set status='CONFIRMED',updated_at=now()
  where id=v_event.id;

  update public.bookings
  set scheduled_start_at=v_event.starts_at,
      scheduled_end_at=v_event.ends_at,
      updated_at=now()
  where id=p_booking_id;

  return jsonb_build_object(
    'booking_id',p_booking_id,
    'status','CONFIRMED',
    'starts_at',v_event.starts_at,
    'ends_at',v_event.ends_at
  );
end;
$$;


ALTER FUNCTION "public"."confirm_moving_schedule"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_rent_payment"("p_submission_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_landlord uuid:=auth.uid(); v_sub record; v_invoice record; v_period record; v_payment_id uuid; v_payment_ids jsonb:='[]'::jsonb; v_renter_email text;
begin
  if v_landlord is null then raise exception 'Authentication required'; end if;
  select * into v_sub from public.rent_payment_submissions where id=p_submission_id for update;
  if not found then raise exception 'Payment submission not found'; end if; if v_sub.landlord_id<>v_landlord then raise exception 'Not authorized to confirm this payment'; end if;
  if v_sub.status='CONFIRMED' then return jsonb_build_object('success',true,'idempotent',true,'submission_id',p_submission_id,'status','CONFIRMED'); end if; if v_sub.status<>'PENDING' then raise exception 'Payment submission is not pending'; end if;
  select * into v_invoice from public.rent_invoices where id=v_sub.invoice_id for update; if not found then raise exception 'Invoice not found'; end if; if v_invoice.landlord_id<>v_landlord then raise exception 'Not authorized to confirm this invoice'; end if; if v_invoice.status<>'PAYMENT_SUBMITTED' then raise exception 'Invoice is not awaiting payment confirmation'; end if;
  for v_period in select * from public.rent_invoice_periods where invoice_id=v_invoice.id order by period_year,period_month loop
    if exists(select 1 from public.rent_payments rp where rp.renter_assoc_id=v_invoice.renter_assoc_id and rp.period_year=v_period.period_year and rp.period_month=v_period.period_month and upper(rp.status)='PAID') then raise exception 'Billing period %-% is already paid',v_period.period_year,v_period.period_month; end if;
    insert into public.rent_payments(renter_assoc_id,unit_id,landlord_id,amount_kes,period_year,period_month,status,paid_at,payment_provider,payment_method,provider_reference,payment_method_id,payment_destination_snapshot,created_at,updated_at)
    values(v_invoice.renter_assoc_id,v_invoice.unit_id,v_invoice.landlord_id,v_period.amount_kes,v_period.period_year,v_period.period_month,'PAID',now(),'MANUAL',coalesce(v_invoice.payment_destination_snapshot->>'provider','MANUAL'),v_sub.transaction_reference,v_invoice.payment_method_id,v_invoice.payment_destination_snapshot,now(),now()) returning id into v_payment_id;
    v_payment_ids:=v_payment_ids||jsonb_build_array(v_payment_id);
  end loop;
  update public.rent_payment_submissions set status='CONFIRMED',confirmed_by=v_landlord,confirmed_at=now(),updated_at=now() where id=p_submission_id;
  update public.rent_invoices set status='PAID',paid_at=now(),confirmed_by=v_landlord,confirmed_at=now(),updated_at=now() where id=v_invoice.id;
  insert into public.user_notifications(user_id,notification_type,title,message,data) values(v_invoice.renter_user_id,'RENT_PAYMENT_CONFIRMED','Rent payment confirmed','Your landlord has confirmed your rent payment. Your SakaCrib invoice is now marked PAID.',jsonb_build_object('invoice_id',v_invoice.id,'invoice_number',v_invoice.invoice_number,'submission_id',p_submission_id,'transaction_reference',v_sub.transaction_reference,'amount_kes',v_invoice.amount_kes,'payment_ids',v_payment_ids));
  insert into public.user_notifications(user_id,notification_type,title,message,data) values(v_landlord,'RENT_PAYMENT_CONFIRMED','Rent payment confirmed','The submitted rent payment has been confirmed and recorded as PAID.',jsonb_build_object('invoice_id',v_invoice.id,'invoice_number',v_invoice.invoice_number,'submission_id',p_submission_id,'transaction_reference',v_sub.transaction_reference,'amount_kes',v_invoice.amount_kes,'payment_ids',v_payment_ids));
  select email into v_renter_email from public.profiles where id=v_invoice.renter_user_id;
  if v_renter_email is not null then insert into public.notification_emails(recipient,subject,html_body,template_type,status) values(v_renter_email,'Rent payment confirmed - '||v_invoice.invoice_number,'<p>Your rent payment for invoice <strong>'||v_invoice.invoice_number||'</strong> has been confirmed by your landlord.</p><p>Amount: KES '||to_char(v_invoice.amount_kes,'FM999,999,990.00')||'<br>Transaction ID: '||v_sub.transaction_reference||'</p><p>Your invoice is now marked PAID in SakaCrib.</p>','rent_payment_confirmed','pending'); end if;
  return jsonb_build_object('success',true,'idempotent',false,'submission_id',p_submission_id,'invoice_id',v_invoice.id,'invoice_number',v_invoice.invoice_number,'status','PAID','payment_ids',v_payment_ids);
end; $$;


ALTER FUNCTION "public"."confirm_rent_payment"("p_submission_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_listing_payment_intent"("p_listing_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid(); v_role text; v_verification_status text;
  v_landlord_application_status text; v_free_used integer := 0;
  v_subscription_id uuid := null; v_subscription_limit integer := null;
  v_subscription_used integer := 0; v_subscription_remaining integer := null; v_intent_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_listing_data IS NULL OR jsonb_typeof(p_listing_data)<>'object' THEN RAISE EXCEPTION 'Listing data is required'; END IF;
  SELECT lower(role),verification_status,landlord_application_status,coalesce(free_listings_used,0)
    INTO v_role,v_verification_status,v_landlord_application_status,v_free_used
    FROM public.profiles WHERE id=v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF v_role NOT IN ('landlord','real_estate') THEN RAISE EXCEPTION 'Only landlord and real estate accounts can create property listings'; END IF;
  IF v_verification_status IS DISTINCT FROM 'verified' THEN RAISE EXCEPTION 'Identity verification is required before payment'; END IF;
  IF v_role='landlord' AND v_landlord_application_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Landlord application approval is required before payment'; END IF;

  IF v_role='landlord' THEN
    SELECT s.subscription_id,s.max_listings INTO v_subscription_id,v_subscription_limit FROM public.get_current_landlord_subscription(v_user_id) s;
  ELSE
    SELECT s.subscription_id,s.max_listings INTO v_subscription_id,v_subscription_limit FROM public.get_current_real_estate_subscription(v_user_id) s;
  END IF;

  IF v_subscription_id IS NOT NULL THEN
    IF v_role='landlord' THEN
      SELECT count(*)::integer INTO v_subscription_used FROM public.subscription_listings sl JOIN public.listings l ON l.id=sl.listing_id
       WHERE sl.subscription_id=v_subscription_id AND sl.status='ACTIVE' AND l.user_id=v_user_id;
    ELSE
      SELECT count(*)::integer INTO v_subscription_used FROM public.subscription_listings sl JOIN public.listings l ON l.id=sl.listing_id
       WHERE sl.real_estate_subscription_id=v_subscription_id AND sl.status='ACTIVE' AND l.user_id=v_user_id;
    END IF;
    IF v_subscription_limit IS NOT NULL THEN v_subscription_remaining:=greatest(v_subscription_limit-v_subscription_used,0); END IF;
  END IF;

  IF v_free_used<3 THEN RAISE EXCEPTION 'A free listing entitlement is available'; END IF;
  IF v_subscription_id IS NOT NULL AND (v_subscription_limit IS NULL OR v_subscription_remaining>0) THEN RAISE EXCEPTION 'A subscription listing entitlement is available'; END IF;
  IF coalesce((p_listing_data->>'is_property_management')::boolean,false) AND v_role<>'landlord' THEN RAISE EXCEPTION 'Property management listings are restricted to landlords'; END IF;
  IF coalesce((p_listing_data->>'is_property_management')::boolean,false) AND v_subscription_id IS NULL THEN RAISE EXCEPTION 'PMS subscription required for property management listings'; END IF;

  UPDATE public.listing_payment_intents SET status='CANCELLED',updated_at=now() WHERE user_id=v_user_id AND status='PENDING';
  INSERT INTO public.listing_payment_intents(user_id,role,amount_kes,status,listing_data)
  VALUES(v_user_id,v_role,1000,'PENDING',p_listing_data) RETURNING id INTO v_intent_id;
  RETURN jsonb_build_object('success',true,'payment_intent_created',true,'listing_created',false,
    'payment_intent_id',v_intent_id,'amount_kes',1000,'status','PENDING');
END;
$$;


ALTER FUNCTION "public"."create_listing_payment_intent"("p_listing_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_paypal_subscription_pending"("p_plan_id" "uuid", "p_billing_cycle" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_plan public.subscription_plans%rowtype;
  v_billing_cycle text := upper(trim(p_billing_cycle));
  v_subscription_id uuid;
  v_existing_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select lower(role) into v_role from public.profiles where id = v_user_id;

  if v_role not in ('landlord', 'real_estate') then
    raise exception 'Subscription checkout is only available to landlord or real estate accounts';
  end if;

  if v_billing_cycle not in ('MONTHLY', 'ANNUAL') then
    raise exception 'Invalid billing cycle. Use MONTHLY or ANNUAL.';
  end if;

  select * into v_plan from public.subscription_plans where id = p_plan_id;
  if not found then
    raise exception 'Subscription plan not found';
  end if;

  if (v_role = 'landlord' and v_plan.audience <> 'LANDLORD')
     or (v_role = 'real_estate' and v_plan.audience <> 'REAL_ESTATE') then
    raise exception 'This plan is not available for your account type';
  end if;

  if (v_billing_cycle = 'MONTHLY' and v_plan.paypal_monthly_plan_id is null)
     or (v_billing_cycle = 'ANNUAL' and v_plan.paypal_annual_plan_id is null) then
    raise exception 'PayPal is not configured for this plan yet';
  end if;

  if v_plan.audience = 'LANDLORD' then
    select id into v_existing_id
      from public.landlord_subscriptions
      where landlord_id = v_user_id and status in ('ACTIVE', 'GRACE_PERIOD')
      limit 1;

    if v_existing_id is not null then
      raise exception 'You already have an active PMS subscription. Use the upgrade or renewal flow.';
    end if;

    update public.landlord_subscriptions
      set status = 'CANCELLED', updated_at = now()
      where landlord_id = v_user_id and status = 'PENDING_PAYMENT';

    insert into public.landlord_subscriptions
      (landlord_id, plan_id, billing_cycle, status, current_period_start, current_period_end, grace_period_end, auto_renew)
    values
      (v_user_id, v_plan.id, v_billing_cycle, 'PENDING_PAYMENT', null, null, null, false)
    returning id into v_subscription_id;
  else
    select id into v_existing_id
      from public.real_estate_subscriptions
      where real_estate_id = v_user_id and status in ('ACTIVE', 'GRACE_PERIOD')
      limit 1;

    if v_existing_id is not null then
      raise exception 'You already have an active subscription. Use the upgrade or renewal flow.';
    end if;

    update public.real_estate_subscriptions
      set status = 'CANCELLED', updated_at = now()
      where real_estate_id = v_user_id and status = 'PENDING_PAYMENT';

    insert into public.real_estate_subscriptions
      (real_estate_id, plan_id, billing_cycle, status, current_period_start, current_period_end, grace_period_end, auto_renew)
    values
      (v_user_id, v_plan.id, v_billing_cycle, 'PENDING_PAYMENT', null, null, null, false)
    returning id into v_subscription_id;
  end if;

  return v_subscription_id;
end;
$$;


ALTER FUNCTION "public"."create_paypal_subscription_pending"("p_plan_id" "uuid", "p_billing_cycle" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_real_estate_subscription_checkout"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_phone_number" "text") RETURNS TABLE("subscription_id" "uuid", "invoice_id" "uuid", "plan_name" "text", "billing_cycle" "text", "amount_kes" numeric, "phone_number" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_user uuid:=auth.uid(); v_role text; v_plan public.subscription_plans%rowtype; v_sub uuid; v_invoice uuid; v_amount numeric; v_cycle text:=upper(trim(p_billing_cycle)); v_phone text:=trim(p_phone_number);
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select lower(role) into v_role from public.profiles where id=v_user;
 if v_role is distinct from 'real_estate' then raise exception 'This subscription checkout is only available to real estate accounts'; end if;
 if v_cycle not in ('MONTHLY','ANNUAL') then raise exception 'Invalid billing cycle. Use MONTHLY or ANNUAL.'; end if;
 if v_phone is null or v_phone='' then raise exception 'M-Pesa phone number is required'; end if;
 select * into v_plan from public.subscription_plans where id=p_plan_id and audience='REAL_ESTATE';
 if not found then raise exception 'Real Estate subscription plan not found'; end if;
 v_amount:=case when v_cycle='MONTHLY' then v_plan.monthly_price_kes else v_plan.annual_price_kes end;
 if v_amount is null or v_amount<=0 then raise exception 'Subscription plan does not have a valid price'; end if;
 if exists(select 1 from public.get_current_real_estate_subscription(v_user)) then raise exception 'You already have an active Real Estate subscription. Use the upgrade or renewal flow.'; end if;
 update public.real_estate_subscriptions set status='CANCELLED',updated_at=now() where real_estate_id=v_user and status='PENDING_PAYMENT';
 insert into public.real_estate_subscriptions(real_estate_id,plan_id,billing_cycle,status,auto_renew) values(v_user,v_plan.id,v_cycle,'PENDING_PAYMENT',false) returning id into v_sub;
 insert into public.subscription_invoices(real_estate_subscription_id,amount_kes,phone_number,status,payment_provider) values(v_sub,v_amount,v_phone,'PENDING','MPESA') returning id into v_invoice;
 return query select v_sub,v_invoice,v_plan.name,v_cycle,v_amount,v_phone;
end;
$$;


ALTER FUNCTION "public"."create_real_estate_subscription_checkout"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_phone_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_rent_invoice"("p_unit_id" "uuid", "p_periods" "jsonb", "p_due_date" "date", "p_payment_method_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_landlord uuid:=auth.uid(); v_unit record; v_assoc record; v_method jsonb; v_period record; v_periods jsonb:='[]'::jsonb;
  v_count int:=0; v_total numeric(12,2):=0; v_start date; v_end date; v_invoice_id uuid; v_invoice_number text; v_prev date;
begin
  if v_landlord is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_periods)<>'array' or jsonb_array_length(p_periods)<1 then raise exception 'At least one billing period is required'; end if;
  if jsonb_array_length(p_periods)>24 then raise exception 'An invoice may cover at most 24 monthly periods'; end if;
  if p_due_date is null then raise exception 'Due date is required'; end if;
  select pu.id,pu.listing_id,pu.user_id,pu.rent,pu.payment_tracking_enabled into v_unit from public.property_units pu where pu.id=p_unit_id and pu.user_id=v_landlord for update;
  if not found then raise exception 'Property unit not found or not owned by landlord'; end if;
  if coalesce(v_unit.payment_tracking_enabled,false)=false then raise exception 'Payment tracking is disabled for this unit'; end if;
  if v_unit.rent is null or v_unit.rent<=0 then raise exception 'Unit rent is not configured'; end if;
  select ra.id,ra.renter_user_id,ra.landlord_id,ra.status into v_assoc from public.renter_unit_associations ra where ra.unit_id=p_unit_id and ra.landlord_id=v_landlord and upper(ra.status)='ACTIVE' order by ra.created_at desc limit 1 for update;
  if not found then raise exception 'No active renter is associated with this unit'; end if;
  v_method:=public.get_rent_payment_destination(p_payment_method_id,p_unit_id);
  if v_method is null then raise exception 'Invalid payment destination'; end if;
  for v_period in select * from jsonb_to_recordset(p_periods) as x(period_year int,period_month int) loop
    if v_period.period_year is null or v_period.period_month is null or v_period.period_month not between 1 and 12 then raise exception 'Invalid billing period'; end if;
    if exists(select 1 from jsonb_array_elements(v_periods) x where (x->>'period_year')::int=v_period.period_year and (x->>'period_month')::int=v_period.period_month) then raise exception 'Duplicate billing period'; end if;
    if exists(select 1 from public.rent_invoice_periods rip join public.rent_invoices ri on ri.id=rip.invoice_id where rip.renter_assoc_id=v_assoc.id and rip.period_year=v_period.period_year and rip.period_month=v_period.period_month and ri.status not in ('CANCELLED','REJECTED')) then raise exception 'Billing period %-% already has an active invoice',v_period.period_year,v_period.period_month; end if;
    if exists(select 1 from public.rent_payments rp where rp.renter_assoc_id=v_assoc.id and rp.period_year=v_period.period_year and rp.period_month=v_period.period_month and upper(rp.status)='PAID') then raise exception 'Billing period %-% is already paid',v_period.period_year,v_period.period_month; end if;
    v_count:=v_count+1; v_total:=v_total+v_unit.rent; v_periods:=v_periods||jsonb_build_array(jsonb_build_object('period_year',v_period.period_year,'period_month',v_period.period_month,'amount_kes',v_unit.rent));
  end loop;
  -- Sort periods independently of the caller's JSON order and enforce continuity.
  for v_period in select * from jsonb_to_recordset(v_periods) as x(period_year int,period_month int) order by period_year,period_month loop
    if v_prev is not null and make_date(v_period.period_year,v_period.period_month,1)<>(v_prev+interval '1 month')::date then raise exception 'Billing periods must be consecutive'; end if;
    v_prev:=make_date(v_period.period_year,v_period.period_month,1);
  end loop;
  select min(make_date((x->>'period_year')::int,(x->>'period_month')::int,1)), max(make_date((x->>'period_year')::int,(x->>'period_month')::int,1)) into v_start,v_end from jsonb_array_elements(v_periods) x;
  v_end:=(v_end+interval '1 month-1 day')::date;
  if p_due_date<v_start then raise exception 'Due date cannot be before the billing period starts'; end if;
  v_invoice_id:=gen_random_uuid(); v_invoice_number:='SC-RENT-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(v_invoice_id::text,'-',''),1,10));
  insert into public.rent_invoices(id,invoice_number,landlord_id,renter_user_id,renter_assoc_id,listing_id,unit_id,billing_period_start,billing_period_end,due_date,amount_kes,status,payment_method_id,payment_destination_snapshot)
  values(v_invoice_id,v_invoice_number,v_landlord,v_assoc.renter_user_id,v_assoc.id,v_unit.listing_id,v_unit.id,v_start,v_end,p_due_date,v_total,'DUE',p_payment_method_id,v_method);
  insert into public.rent_invoice_periods(invoice_id,renter_assoc_id,unit_id,period_year,period_month,amount_kes)
  select v_invoice_id,v_assoc.id,v_unit.id,(x->>'period_year')::int,(x->>'period_month')::int,(x->>'amount_kes')::numeric from jsonb_array_elements(v_periods) x;
  insert into public.user_notifications(user_id,notification_type,title,message,data) values(v_assoc.renter_user_id,'RENT_INVOICE_CREATED','New rent invoice','A new rent invoice has been created for your unit.',jsonb_build_object('invoice_id',v_invoice_id,'invoice_number',v_invoice_number,'amount_kes',v_total,'due_date',p_due_date));
  insert into public.notification_emails(recipient,subject,html_body,template_type,status) select p.email,'SakaCrib rent invoice '||v_invoice_number,'<p>Your SakaCrib rent invoice <strong>'||v_invoice_number||'</strong> is ready.</p><p>Amount: KES '||to_char(v_total,'FM999,999,990.00')||'<br>Due: '||p_due_date::text||'</p><p>Use the payment instructions shown on the invoice and submit your external transaction ID in SakaCrib after payment.</p>','rent_invoice_created','pending' from public.profiles p where p.id=v_assoc.renter_user_id;
  return jsonb_build_object('success',true,'invoice_id',v_invoice_id,'invoice_number',v_invoice_number,'amount_kes',v_total,'billing_period_start',v_start,'billing_period_end',v_end,'due_date',p_due_date,'payment_destination',v_method);
end; $$;


ALTER FUNCTION "public"."create_rent_invoice"("p_unit_id" "uuid", "p_periods" "jsonb", "p_due_date" "date", "p_payment_method_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_rent_payment_intent"("p_renter_assoc_id" "uuid", "p_periods" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := auth.uid();
  v_assoc record;
  v_unit record;
  v_period record;
  v_prev_year int;
  v_prev_month int;
  v_count int := 0;
  v_total numeric(12,2) := 0;
  v_periods jsonb := '[]'::jsonb;
  v_intent uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_periods) <> 'array' then raise exception 'Payment periods must be an array'; end if;
  if jsonb_array_length(p_periods) < 1 or jsonb_array_length(p_periods) > 3 then raise exception 'A rent payment may cover 1 to 3 periods'; end if;

  select ra.*, pu.rent, pu.payment_tracking_enabled, pu.user_id as unit_user_id, pu.listing_id
    into v_assoc
  from renter_unit_associations ra
  join property_units pu on pu.id = ra.unit_id
  where ra.id = p_renter_assoc_id
    and ra.renter_user_id = v_user
    and ra.status = 'ACTIVE'
  for update of ra;
  if not found then raise exception 'Active renter association not found'; end if;
  if not v_assoc.payment_tracking_enabled then raise exception 'Payment tracking is disabled for this unit'; end if;

  for v_period in select * from jsonb_to_recordset(p_periods) as x(period_year int, period_month int) loop
    if v_period.period_year is null or v_period.period_month is null or v_period.period_month < 1 or v_period.period_month > 12 then
      raise exception 'Invalid payment period';
    end if;
    v_count := v_count + 1;
    if exists (select 1 from jsonb_array_elements(v_periods) p where (p->>'period_year')::int = v_period.period_year and (p->>'period_month')::int = v_period.period_month) then
      raise exception 'Duplicate payment period';
    end if;
    if exists (select 1 from rent_payments rp where rp.renter_assoc_id = v_assoc.id and rp.unit_id = v_assoc.unit_id and rp.period_year = v_period.period_year and rp.period_month = v_period.period_month and rp.status = 'PAID') then
      raise exception 'Payment period %-% is already paid', v_period.period_year, v_period.period_month;
    end if;
    v_total := v_total + v_assoc.rent;
    v_periods := v_periods || jsonb_build_array(jsonb_build_object('period_year', v_period.period_year, 'period_month', v_period.period_month));
  end loop;

  for v_period in select * from jsonb_to_recordset(v_periods) as x(period_year int, period_month int) order by period_year, period_month loop
    if v_prev_year is not null and (v_period.period_year * 12 + v_period.period_month) <> (v_prev_year * 12 + v_prev_month + 1) then
      raise exception 'Payment periods must be consecutive';
    end if;
    v_prev_year := v_period.period_year; v_prev_month := v_period.period_month;
  end loop;

  insert into rent_payment_intents(renter_user_id, renter_assoc_id, unit_id, landlord_id, payment_periods, amount_kes)
  values(v_user, v_assoc.id, v_assoc.unit_id, v_assoc.landlord_id, v_periods, v_total)
  returning id into v_intent;

  return jsonb_build_object('success', true, 'payment_intent_id', v_intent, 'amount_kes', v_total, 'payment_periods', v_periods, 'unit_id', v_assoc.unit_id, 'renter_assoc_id', v_assoc.id);
end;
$$;


ALTER FUNCTION "public"."create_rent_payment_intent"("p_renter_assoc_id" "uuid", "p_periods" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_renter_invitation"("p_unit_id" "uuid", "p_renter_name" "text", "p_renter_phone" "text", "p_renter_email" "text", "p_app_base_url" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_landlord uuid := auth.uid();
  v_unit record;
  v_existing record;
  v_row public.renter_unit_associations;
  v_raw_token text;
begin
  if v_landlord is null then
    raise exception 'Authentication required';
  end if;

  if p_renter_name is null or trim(p_renter_name) = '' then
    raise exception 'Renter name is required';
  end if;

  if p_renter_email is null or trim(p_renter_email) = '' then
    raise exception 'Renter email is required';
  end if;

  select * into v_unit
  from public.property_units
  where id = p_unit_id and user_id = v_landlord;

  if not found then
    raise exception 'Unit not found or not owned by this account';
  end if;

  select * into v_existing
  from public.renter_unit_associations
  where unit_id = p_unit_id
    and status in ('ACTIVE', 'PENDING');

  if found then
    raise exception 'This unit already has an active or pending renter association';
  end if;

  v_raw_token := encode(gen_random_bytes(32), 'hex');

  insert into public.renter_unit_associations (
    unit_id, landlord_id, renter_name, renter_phone, renter_email,
    rent_amount, status, invite_token_hash, invited_at, invite_expires_at
  ) values (
    p_unit_id, v_landlord, trim(p_renter_name), nullif(trim(p_renter_phone), ''),
    trim(p_renter_email), v_unit.rent, 'PENDING',
    encode(digest(v_raw_token, 'sha256'), 'hex'),
    now(), now() + interval '14 days'
  )
  returning * into v_row;

  if p_app_base_url is not null then
    begin
      insert into public.notification_emails (
        recipient, subject, html_body, template_type, status
      ) values (
        v_row.renter_email,
        'You''ve been invited to SakaCrib',
        '<p>You have been invited to connect your rental to SakaCrib.</p>'
          || '<p>Open this link to review the details and claim your rental:</p>'
          || '<p><a href="' || p_app_base_url || '/#claim-rental/' || v_raw_token || '">'
          || p_app_base_url || '/#claim-rental/' || v_raw_token || '</a></p>'
          || '<p>This link expires in 14 days.</p>',
        'renter_invitation',
        'pending'
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'unit_id', v_row.unit_id,
    'renter_name', v_row.renter_name,
    'renter_phone', v_row.renter_phone,
    'renter_email', v_row.renter_email,
    'rent_amount', v_row.rent_amount,
    'status', v_row.status,
    'invited_at', v_row.invited_at,
    'invite_expires_at', v_row.invite_expires_at,
    'invite_token', v_raw_token
  );
end;
$$;


ALTER FUNCTION "public"."create_renter_invitation"("p_unit_id" "uuid", "p_renter_name" "text", "p_renter_phone" "text", "p_renter_email" "text", "p_app_base_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_role_aware_listing"("p_title" "text", "p_description" "text", "p_city" "text", "p_county" "text", "p_location_search" "text" DEFAULT NULL::"text", "p_latitude" double precision DEFAULT NULL::double precision, "p_longitude" double precision DEFAULT NULL::double precision, "p_property_name" "text" DEFAULT NULL::"text", "p_property_type" "text" DEFAULT NULL::"text", "p_price_kes" numeric DEFAULT NULL::numeric, "p_listing_type" "text" DEFAULT 'rent'::"text", "p_deposit_required" boolean DEFAULT false, "p_deposit_structure" "text" DEFAULT NULL::"text", "p_deposit_amount" numeric DEFAULT 0, "p_size" "text" DEFAULT NULL::"text", "p_beds" integer DEFAULT 0, "p_baths" integer DEFAULT 0, "p_contact_phone" "text" DEFAULT NULL::"text", "p_contact_email" "text" DEFAULT NULL::"text", "p_social_links" "jsonb" DEFAULT '[]'::"jsonb", "p_booking_enabled" boolean DEFAULT false, "p_payment_enabled" boolean DEFAULT false, "p_is_property_management" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid(); v_role text; v_verification_status text;
  v_landlord_application_status text; v_free_used integer := 0;
  v_subscription_id uuid := null; v_subscription_plan text := null;
  v_subscription_status text := null; v_subscription_limit integer := null;
  v_subscription_used integer := 0; v_subscription_remaining integer := null;
  v_listing_id uuid; v_entitlement text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT lower(role),verification_status,landlord_application_status,coalesce(free_listings_used,0)
    INTO v_role,v_verification_status,v_landlord_application_status,v_free_used
    FROM public.profiles WHERE id=v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF v_role NOT IN ('landlord','real_estate') THEN RAISE EXCEPTION 'Only landlord and real estate accounts can create property listings'; END IF;
  IF v_verification_status IS DISTINCT FROM 'verified' THEN RAISE EXCEPTION 'Identity verification is required before creating a listing'; END IF;
  IF v_role='landlord' AND v_landlord_application_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Landlord application approval is required before creating a listing'; END IF;

  IF v_role='landlord' THEN
    SELECT s.subscription_id,s.plan_name,s.subscription_status,s.max_listings
      INTO v_subscription_id,v_subscription_plan,v_subscription_status,v_subscription_limit
      FROM public.get_current_landlord_subscription(v_user_id) s;
  ELSE
    SELECT s.subscription_id,s.plan_name,s.subscription_status,s.max_listings
      INTO v_subscription_id,v_subscription_plan,v_subscription_status,v_subscription_limit
      FROM public.get_current_real_estate_subscription(v_user_id) s;
  END IF;

  IF v_subscription_id IS NOT NULL THEN
    IF v_role='landlord' THEN
      SELECT count(*)::integer INTO v_subscription_used
        FROM public.subscription_listings sl JOIN public.listings l ON l.id=sl.listing_id
       WHERE sl.subscription_id=v_subscription_id AND sl.status='ACTIVE' AND l.user_id=v_user_id;
    ELSE
      SELECT count(*)::integer INTO v_subscription_used
        FROM public.subscription_listings sl JOIN public.listings l ON l.id=sl.listing_id
       WHERE sl.real_estate_subscription_id=v_subscription_id AND sl.status='ACTIVE' AND l.user_id=v_user_id;
    END IF;
    IF v_subscription_limit IS NOT NULL THEN v_subscription_remaining:=greatest(v_subscription_limit-v_subscription_used,0); END IF;
  END IF;

  IF p_is_property_management AND v_role <> 'landlord' THEN RAISE EXCEPTION 'Property management listings are currently available only to landlord accounts'; END IF;
  IF p_is_property_management AND v_subscription_id IS NULL THEN RAISE EXCEPTION 'PMS subscription required for property management listings'; END IF;

  IF v_free_used < 3 THEN
    v_entitlement := 'FREE';
  ELSIF v_subscription_id IS NOT NULL AND (v_subscription_limit IS NULL OR v_subscription_remaining>0) THEN
    v_entitlement := 'SUBSCRIPTION';
  ELSE
    RETURN jsonb_build_object('success',false,'listing_created',false,'can_start_listing',true,'can_create',false,
      'requires_individual_payment',true,'requires_subscription',v_subscription_id IS NULL,
      'individual_listing_price_kes',1000,'subscription_id',v_subscription_id,
      'subscription_plan',v_subscription_plan,'subscription_status',v_subscription_status,
      'subscription_limit',v_subscription_limit,'subscription_listings_used',v_subscription_used,
      'subscription_listings_remaining',v_subscription_remaining);
  END IF;

  INSERT INTO public.listings(
    user_id,title,description,city,county,location_search,latitude,longitude,property_name,property_type,
    price_kes,listing_type,deposit_required,deposit_structure,deposit_amount,size,beds,baths,
    contact_phone,contact_email,social_links,booking_enabled,payment_enabled,is_property_management,
    is_paid,is_published,approval_status,is_approved,status
  ) VALUES(
    v_user_id,coalesce(p_title,''),coalesce(p_description,''),coalesce(p_city,''),coalesce(p_county,''),
    p_location_search,p_latitude,p_longitude,p_property_name,p_property_type,p_price_kes,
    coalesce(p_listing_type,'rent'),coalesce(p_deposit_required,false),p_deposit_structure,coalesce(p_deposit_amount,0),
    p_size,coalesce(p_beds,0),coalesce(p_baths,0),p_contact_phone,p_contact_email,
    coalesce(p_social_links,'[]'::jsonb),coalesce(p_booking_enabled,false),coalesce(p_payment_enabled,false),
    coalesce(p_is_property_management,false),true,false,'pending_review',false,'pending'
  ) RETURNING id INTO v_listing_id;

  IF v_entitlement='FREE' THEN
    UPDATE public.profiles SET free_listings_used=coalesce(free_listings_used,0)+1,updated_at=now() WHERE id=v_user_id;
  ELSIF v_role='landlord' THEN
    INSERT INTO public.subscription_listings(subscription_id,listing_id,status,activated_at)
    VALUES(v_subscription_id,v_listing_id,'ACTIVE',now());
  ELSE
    INSERT INTO public.subscription_listings(real_estate_subscription_id,listing_id,status,activated_at)
    VALUES(v_subscription_id,v_listing_id,'ACTIVE',now());
  END IF;

  RETURN jsonb_build_object('success',true,'listing_created',true,'listing_id',v_listing_id,
    'listing_entitlement',v_entitlement,'payment_required',false,'is_paid',true,
    'is_published',false,'approval_status','pending_review','subscription_id',v_subscription_id);
END;
$$;


ALTER FUNCTION "public"."create_role_aware_listing"("p_title" "text", "p_description" "text", "p_city" "text", "p_county" "text", "p_location_search" "text", "p_latitude" double precision, "p_longitude" double precision, "p_property_name" "text", "p_property_type" "text", "p_price_kes" numeric, "p_listing_type" "text", "p_deposit_required" boolean, "p_deposit_structure" "text", "p_deposit_amount" numeric, "p_size" "text", "p_beds" integer, "p_baths" integer, "p_contact_phone" "text", "p_contact_email" "text", "p_social_links" "jsonb", "p_booking_enabled" boolean, "p_payment_enabled" boolean, "p_is_property_management" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_subscription_checkout"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_phone_number" "text") RETURNS TABLE("subscription_id" "uuid", "invoice_id" "uuid", "plan_name" "text", "billing_cycle" "text", "amount_kes" numeric, "phone_number" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_landlord_id uuid:=auth.uid(); v_role text; v_plan public.subscription_plans%rowtype; v_subscription_id uuid; v_invoice_id uuid; v_amount numeric; v_existing_subscription uuid; v_billing_cycle text:=upper(trim(p_billing_cycle)); v_phone_number text:=trim(p_phone_number);
begin
 if v_landlord_id is null then raise exception 'Authentication required'; end if;
 select lower(role) into v_role from public.profiles where id=v_landlord_id;
 if v_role is distinct from 'landlord' then raise exception 'This subscription checkout is only available to landlord accounts'; end if;
 if v_billing_cycle not in ('MONTHLY','ANNUAL') then raise exception 'Invalid billing cycle. Use MONTHLY or ANNUAL.'; end if;
 if v_phone_number is null or v_phone_number='' then raise exception 'M-Pesa phone number is required'; end if;
 select * into v_plan from public.subscription_plans where id=p_plan_id and audience='LANDLORD';
 if not found then raise exception 'Landlord subscription plan not found'; end if;
 v_amount:=case when v_billing_cycle='MONTHLY' then v_plan.monthly_price_kes else v_plan.annual_price_kes end;
 if v_amount is null or v_amount<=0 then raise exception 'Subscription plan does not have a valid price'; end if;
 select s.subscription_id into v_existing_subscription from public.get_current_landlord_subscription(v_landlord_id) s;
 if v_existing_subscription is not null then raise exception 'You already have an active PMS subscription. Use the upgrade or renewal flow.'; end if;
 update public.landlord_subscriptions set status='CANCELLED',updated_at=now() where landlord_id=v_landlord_id and status='PENDING_PAYMENT';
 insert into public.landlord_subscriptions(landlord_id,plan_id,billing_cycle,status,current_period_start,current_period_end,grace_period_end,auto_renew) values(v_landlord_id,v_plan.id,v_billing_cycle,'PENDING_PAYMENT',null,null,null,false) returning id into v_subscription_id;
 insert into public.subscription_invoices(landlord_subscription_id,amount_kes,phone_number,status,payment_provider) values(v_subscription_id,v_amount,v_phone_number,'PENDING','MPESA') returning id into v_invoice_id;
 return query select v_subscription_id,v_invoice_id,v_plan.name,v_billing_cycle,v_amount,v_phone_number;
end;
$$;


ALTER FUNCTION "public"."create_subscription_checkout"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_phone_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_user_notification"("p_user_id" "uuid", "p_notification_type" "text", "p_title" "text", "p_message" "text", "p_data" "jsonb" DEFAULT '{}'::"jsonb", "p_event_key" "text" DEFAULT NULL::"text", "p_send_email" boolean DEFAULT true, "p_email_template" "text" DEFAULT 'generic'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_email text; v_notification_id uuid; v_email_id uuid;
begin
 if p_user_id is null then raise exception 'Recipient is required'; end if;
 if nullif(trim(p_notification_type),'') is null then raise exception 'Notification type is required'; end if;
 if nullif(trim(p_title),'') is null then raise exception 'Notification title is required'; end if;
 if nullif(trim(p_message),'') is null then raise exception 'Notification message is required'; end if;
 if p_event_key is not null and exists(select 1 from public.user_notifications where event_key=p_event_key) then
   select id into v_notification_id from public.user_notifications where event_key=p_event_key limit 1;
   return jsonb_build_object('status','ALREADY_QUEUED','notification_id',v_notification_id);
 end if;
 select email into v_email from public.profiles where id=p_user_id;
 if not found then raise exception 'Recipient profile not found'; end if;
 insert into public.user_notifications(user_id,notification_type,title,message,data,event_key)
 values(p_user_id,p_notification_type,p_title,p_message,coalesce(p_data,'{}'::jsonb),p_event_key)
 returning id into v_notification_id;
 if p_send_email and nullif(trim(v_email),'') is not null then
   insert into public.notification_emails(recipient,subject,html_body,template_type)
   values(v_email,p_title,format('<p>%s</p>',replace(replace(replace(p_message,'&','&amp;'),'<','&lt;'),'>','&gt;')),p_email_template)
   returning id into v_email_id;
 end if;
 return jsonb_build_object('status','QUEUED','notification_id',v_notification_id,'email_id',v_email_id);
end; $$;


ALTER FUNCTION "public"."dispatch_user_notification"("p_user_id" "uuid", "p_notification_type" "text", "p_title" "text", "p_message" "text", "p_data" "jsonb", "p_event_key" "text", "p_send_email" boolean, "p_email_template" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_property_unit_entitlement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_user_id uuid;
    v_role text;
    v_listing_owner uuid;
    v_subscription_id uuid;
    v_subscription_plan text;
    v_max_units_per_listing integer;
    v_listing_is_pms boolean;
    v_existing_units integer;
begin
    v_user_id := auth.uid();
    if v_user_id is null then raise exception 'UNIT_REJECTED: authentication required.'; end if;

    select role into v_role from public.profiles where id = v_user_id;
    if v_role is distinct from 'landlord' then
        raise exception 'UNIT_REJECTED: PMS units are currently available only to landlord accounts.';
    end if;

    if new.user_id is null then new.user_id := v_user_id; end if;
    if new.user_id <> v_user_id then raise exception 'UNIT_REJECTED: unit owner does not match authenticated landlord.'; end if;

    perform pg_advisory_xact_lock(hashtextextended('landlord-unit-entitlement:' || v_user_id::text, 0));

    select l.user_id, coalesce(l.is_property_management, false)
    into v_listing_owner, v_listing_is_pms
    from public.listings l where l.id = new.listing_id for share;

    if not found then raise exception 'UNIT_REJECTED: listing does not exist.'; end if;
    if v_listing_owner <> v_user_id then raise exception 'UNIT_REJECTED: you cannot create a unit for another landlord''s listing.'; end if;
    if v_listing_is_pms = false then raise exception 'UNIT_REJECTED: property management is not enabled for this listing.'; end if;

    select s.subscription_id, s.plan_name, s.max_units_per_listing
    into v_subscription_id, v_subscription_plan, v_max_units_per_listing
    from public.get_current_landlord_subscription(v_user_id) s;

    if v_subscription_id is null then raise exception 'UNIT_REJECTED: active PMS subscription required.'; end if;
    if v_max_units_per_listing is null then return new; end if;

    select count(*) into v_existing_units from public.property_units pu where pu.listing_id = new.listing_id;
    if v_existing_units >= v_max_units_per_listing then
        raise exception 'UNIT_LIMIT_REACHED:%:%:%', v_subscription_plan, v_existing_units, v_max_units_per_listing;
    end if;

    return new;
end;
$$;


ALTER FUNCTION "public"."enforce_property_unit_entitlement"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_mover_payout_for_paid_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_mover public.movers%rowtype;
begin
  if new.payment_status <> 'paid' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.payment_status = 'paid' then
    return new;
  end if;

  select * into v_mover from public.movers where id = new.mover_id;
  if not found then
    raise exception 'Cannot create payout: mover not found';
  end if;

  insert into public.mover_payouts (
    booking_id,
    mover_id,
    mover_name,
    national_id,
    payment_channel,
    renter_payment,
    platform_deduction,
    net_mover_payable,
    down_payment_amount,
    final_payment_amount,
    down_payment_status,
    final_payment_status
  ) values (
    new.id,
    new.mover_id,
    v_mover.driver_full_name,
    v_mover.national_id,
    v_mover.payment_channel,
    new.total_amount,
    new.commission_amount,
    greatest(new.total_amount - new.commission_amount, 0),
    new.total_amount,
    0,
    'held',
    'held'
  )
  on conflict (booking_id) do update set
    renter_payment = excluded.renter_payment,
    platform_deduction = excluded.platform_deduction,
    net_mover_payable = excluded.net_mover_payable,
    updated_at = now();

  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_mover_payout_for_paid_booking"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_mover_requests"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_count integer:=0; r record;
begin
 for r in
   update public.bookings set status='cancelled',cancelled_at=now(),cancellation_reason='MOVER_TAKING_TOO_LONG',cancellation_details='Mover did not respond within 30 minutes.',updated_at=now()
   where status='pending' and request_expires_at is not null and request_expires_at<=now()
   returning id,renter_id,mover_id
 loop
   insert into public.moving_cancellation_events(booking_id,cancelled_by,reason_code,reason_text) values(r.id,r.renter_id,'MOVER_TAKING_TOO_LONG','Mover did not respond within 30 minutes.');
   perform public.dispatch_user_notification(r.renter_id,'MOVING_REQUEST_EXPIRED','Mover request expired','The mover did not respond within 30 minutes. You can choose another mover.',jsonb_build_object('booking_id',r.id),'moving_request_expired:'||r.id::text,true,'moving_request_expired');
   v_count:=v_count+1;
 end loop;
 return v_count;
end; $$;


ALTER FUNCTION "public"."expire_mover_requests"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_mover_payout"("p_payout_id" "uuid", "p_provider" "text", "p_provider_reference" "text", "p_provider_transaction_id" "text", "p_success" boolean, "p_failure_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare v_p public.mover_payouts%rowtype; v_b public.bookings%rowtype; v_now timestamptz:=now();
begin
 if p_provider<>'MPESA' then raise exception 'Unsupported payout provider'; end if;
 if p_provider_reference is null or btrim(p_provider_reference)='' then raise exception 'Payout provider reference is required'; end if;
 select * into v_p from public.mover_payouts where id=p_payout_id for update;
 if not found then raise exception 'Payout not found'; end if;
 select * into v_b from public.bookings where id=v_p.booking_id for update;
 if not found then raise exception 'Booking not found'; end if;
 if v_b.dispute_status='OPEN' then raise exception 'Payout blocked while dispute is open'; end if;
 if v_p.final_payment_status='released' then return jsonb_build_object('status','released','already_processed',true,'payout_id',v_p.id); end if;
 if v_p.final_payment_status<>'processing' then raise exception 'Payout callback received before admin escrow release'; end if;
 if p_success then
   update public.mover_payouts set final_payment_status='released',final_payment_released_at=coalesce(final_payment_released_at,v_now),payout_provider=p_provider,payout_provider_reference=p_provider_reference,payout_provider_transaction_id=p_provider_transaction_id,payout_completed_at=v_now,payout_failure_reason=null,updated_at=v_now where id=v_p.id;
   update public.bookings set status='completed',completed_at=coalesce(completed_at,v_now),contact_released_at=coalesce(contact_released_at,v_now),updated_at=v_now where id=v_p.booking_id;
   return jsonb_build_object('status','released','payout_id',v_p.id,'booking_id',v_p.booking_id,'amount',v_p.net_mover_payable);
 else
   update public.mover_payouts set final_payment_status='failed',payout_provider=p_provider,payout_provider_reference=p_provider_reference,payout_provider_transaction_id=p_provider_transaction_id,payout_failure_reason=left(coalesce(p_failure_reason,'Payout failed'),1000),updated_at=v_now where id=v_p.id;
   return jsonb_build_object('status','failed','payout_id',v_p.id,'booking_id',v_p.booking_id,'next_step','PAYOUT_RETRY_OR_ADMIN_INTERVENTION');
 end if;
end; $$;


ALTER FUNCTION "public"."finalize_mover_payout"("p_payout_id" "uuid", "p_provider" "text", "p_provider_reference" "text", "p_provider_transaction_id" "text", "p_success" boolean, "p_failure_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_paypal_recurring_payment"("p_subscription_id" "text", "p_provider_transaction_id" "text", "p_amount_usd" numeric, "p_webhook_event_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  ls public.landlord_subscriptions%ROWTYPE;
  rs public.real_estate_subscriptions%ROWTYPE;
  inv public.subscription_invoices%ROWTYPE;
  plan public.subscription_plans%ROWTYPE;
  owner_id uuid;
  owner_email text;
  sub_type text;
  sub_uuid uuid;
  amount_kes numeric;
  expected_usd numeric;
  period_start timestamptz;
  period_end timestamptz;
  now_ts timestamptz := now();
  existing_invoice_id uuid;
  email_template text;
BEGIN
  IF nullif(trim(p_subscription_id),'') IS NULL THEN RAISE EXCEPTION 'PayPal subscription ID is required'; END IF;
  IF nullif(trim(p_provider_transaction_id),'') IS NULL THEN RAISE EXCEPTION 'PayPal transaction ID is required'; END IF;
  IF p_amount_usd IS NULL OR p_amount_usd <= 0 THEN RAISE EXCEPTION 'Invalid PayPal amount'; END IF;

  SELECT id INTO existing_invoice_id
  FROM public.subscription_invoices
  WHERE payment_provider='PAYPAL' AND provider_transaction_id=p_provider_transaction_id
  LIMIT 1;
  IF existing_invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object('already_processed',true,'invoice_id',existing_invoice_id);
  END IF;

  SELECT * INTO ls FROM public.landlord_subscriptions
  WHERE paypal_subscription_id=p_subscription_id FOR UPDATE;
  IF FOUND THEN
    sub_type := 'LANDLORD'; sub_uuid := ls.id; owner_id := ls.landlord_id;
    SELECT * INTO plan FROM public.subscription_plans WHERE id=ls.plan_id;
    amount_kes := ls.billing_amount_kes;
    expected_usd := ls.billing_amount_usd;
  ELSE
    SELECT * INTO rs FROM public.real_estate_subscriptions
    WHERE paypal_subscription_id=p_subscription_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PayPal subscription not found'; END IF;
    sub_type := 'REAL_ESTATE'; sub_uuid := rs.id; owner_id := rs.real_estate_id;
    SELECT * INTO plan FROM public.subscription_plans WHERE id=rs.plan_id;
    amount_kes := rs.billing_amount_kes;
    expected_usd := rs.billing_amount_usd;
  END IF;

  IF expected_usd IS NULL OR expected_usd <= 0 THEN RAISE EXCEPTION 'Subscription has no locked USD billing amount'; END IF;
  IF abs(expected_usd-p_amount_usd) > 0.01 THEN RAISE EXCEPTION 'PayPal amount does not match locked subscription amount'; END IF;
  IF plan.id IS NULL THEN RAISE EXCEPTION 'Subscription plan not found'; END IF;

  IF sub_type='LANDLORD' THEN
    SELECT * INTO inv FROM public.subscription_invoices
    WHERE landlord_subscription_id=sub_uuid AND payment_provider='PAYPAL' AND status='PENDING'
      AND (paypal_subscription_id=p_subscription_id OR paypal_subscription_id IS NULL)
    ORDER BY created_at ASC LIMIT 1 FOR UPDATE;
  ELSE
    SELECT * INTO inv FROM public.subscription_invoices
    WHERE real_estate_subscription_id=sub_uuid AND payment_provider='PAYPAL' AND status='PENDING'
      AND (paypal_subscription_id=p_subscription_id OR paypal_subscription_id IS NULL)
    ORDER BY created_at ASC LIMIT 1 FOR UPDATE;
  END IF;

  IF inv.id IS NULL THEN
    IF sub_type='LANDLORD' THEN
      period_start := COALESCE(NULLIF(ls.current_period_end, ls.current_period_start), now_ts);
    ELSE
      period_start := COALESCE(NULLIF(rs.current_period_end, rs.current_period_start), now_ts);
    END IF;
    IF period_start < now_ts THEN period_start := now_ts; END IF;
    IF sub_type='LANDLORD' AND ls.billing_cycle='ANNUAL' THEN period_end := period_start + interval '1 year';
    ELSIF sub_type='REAL_ESTATE' AND rs.billing_cycle='ANNUAL' THEN period_end := period_start + interval '1 year';
    ELSE period_end := period_start + interval '1 month'; END IF;

    IF sub_type='LANDLORD' THEN
      INSERT INTO public.subscription_invoices(
        amount_kes,status,payment_provider,payment_method,landlord_subscription_id,currency,amount_usd,
        exchange_rate,exchange_rate_source,exchange_rate_timestamp,paypal_subscription_id,
        billing_period_start,billing_period_end,webhook_event_id,pricing_snapshot_source
      ) VALUES(
        amount_kes,'PENDING','PAYPAL','PAYPAL',sub_uuid,'USD',expected_usd,ls.billing_exchange_rate,
        'ExchangeRate-API (PayPal plan snapshot)',ls.billing_exchange_rate_timestamp,p_subscription_id,
        period_start,period_end,p_webhook_event_id,'PAYPAL_RECURRING_PLAN'
      ) RETURNING * INTO inv;
    ELSE
      INSERT INTO public.subscription_invoices(
        amount_kes,status,payment_provider,payment_method,real_estate_subscription_id,currency,amount_usd,
        exchange_rate,exchange_rate_source,exchange_rate_timestamp,paypal_subscription_id,
        billing_period_start,billing_period_end,webhook_event_id,pricing_snapshot_source
      ) VALUES(
        amount_kes,'PENDING','PAYPAL','PAYPAL',sub_uuid,'USD',expected_usd,rs.billing_exchange_rate,
        'ExchangeRate-API (PayPal plan snapshot)',rs.billing_exchange_rate_timestamp,p_subscription_id,
        period_start,period_end,p_webhook_event_id,'PAYPAL_RECURRING_PLAN'
      ) RETURNING * INTO inv;
    END IF;
  ELSE
    period_start := COALESCE(inv.billing_period_start, now_ts);
    IF sub_type='LANDLORD' AND ls.billing_cycle='ANNUAL' THEN period_end := period_start + interval '1 year';
    ELSIF sub_type='REAL_ESTATE' AND rs.billing_cycle='ANNUAL' THEN period_end := period_start + interval '1 year';
    ELSE period_end := period_start + interval '1 month'; END IF;
  END IF;

  UPDATE public.subscription_invoices
  SET status='PAID', provider_reference=p_subscription_id, provider_transaction_id=p_provider_transaction_id,
      payment_method='PAYPAL', paid_at=now_ts, paypal_subscription_id=p_subscription_id,
      billing_period_start=period_start,billing_period_end=period_end,webhook_event_id=p_webhook_event_id,
      result_description='PayPal recurring payment completed'
  WHERE id=inv.id;

  IF sub_type='LANDLORD' THEN
    UPDATE public.landlord_subscriptions
    SET status='ACTIVE',auto_renew=true,paypal_status='ACTIVE',
        current_period_start=period_start,current_period_end=period_end,
        next_billing_at=period_end,grace_period_end=NULL,cancel_at_period_end=false,cancelled_at=NULL,updated_at=now_ts
    WHERE id=sub_uuid;
  ELSE
    UPDATE public.real_estate_subscriptions
    SET status='ACTIVE',auto_renew=true,paypal_status='ACTIVE',
        current_period_start=period_start,current_period_end=period_end,
        next_billing_at=period_end,grace_period_end=NULL,cancel_at_period_end=false,cancelled_at=NULL,updated_at=now_ts
    WHERE id=sub_uuid;
  END IF;

  SELECT email INTO owner_email FROM auth.users WHERE id=owner_id;
  IF owner_email IS NOT NULL THEN
    email_template := CASE WHEN inv.billing_period_start IS NOT NULL AND inv.created_at < now_ts - interval '1 minute'
      THEN 'SUBSCRIPTION_RENEWAL_SUCCESS' ELSE 'SUBSCRIPTION_PAYMENT_SUCCESS' END;
    INSERT INTO public.notification_emails(recipient,subject,html_body,template_type,status,created_at)
    VALUES(
      owner_email,
      'SakaHao subscription payment successful',
      format('<h2>Payment successful</h2><p>Your %s subscription payment was successfully received via PayPal.</p><p><strong>Invoice:</strong> %s<br><strong>Amount:</strong> KES %s (USD %s)<br><strong>Next billing date:</strong> %s</p>',sub_type,inv.id,inv.amount_kes,to_char(inv.amount_usd,'FM999999990.00'),to_char(period_end,'YYYY-MM-DD')),
      email_template,'pending',now_ts
    );
  END IF;

  RETURN jsonb_build_object('processed',true,'invoice_id',inv.id,'subscription_id',sub_uuid,'subscription_type',sub_type,'period_start',period_start,'period_end',period_end,'next_billing_at',period_end,'email_queued',owner_email IS NOT NULL);
END;
$$;


ALTER FUNCTION "public"."finalize_paypal_recurring_payment"("p_subscription_id" "text", "p_provider_transaction_id" "text", "p_amount_usd" numeric, "p_webhook_event_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_subscription_payment"("p_checkout_request_id" "text", "p_merchant_request_id" "text", "p_result_code" integer, "p_result_description" "text", "p_mpesa_receipt" "text" DEFAULT NULL::"text", "p_paid_amount" numeric DEFAULT NULL::numeric, "p_phone_number" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

DECLARE

    -- ========================================================
    -- PAYMENT / INVOICE
    -- ========================================================

    v_invoice public.subscription_invoices%rowtype;

    -- ========================================================
    -- SUBSCRIPTION
    -- ========================================================

    v_subscription public.landlord_subscriptions%rowtype;

    -- ========================================================
    -- BILLING PERIOD
    -- ========================================================

    v_new_period_start timestamptz;
    v_new_period_end timestamptz;
    v_base_date timestamptz;

BEGIN

    -- ========================================================
    -- 1. BASIC VALIDATION
    -- ========================================================

    IF p_checkout_request_id IS NULL
       OR trim(p_checkout_request_id) = '' THEN

        RAISE EXCEPTION
            'CheckoutRequestID is required';

    END IF;


    -- ========================================================
    -- 2. FIND AND LOCK INVOICE
    -- ========================================================
    --
    -- FOR UPDATE prevents two simultaneous M-Pesa callbacks
    -- from processing the same invoice simultaneously.
    --
    -- This is important because Safaricom can retry callbacks.
    -- ========================================================

    SELECT *
    INTO v_invoice

    FROM public.subscription_invoices

    WHERE checkout_request_id = p_checkout_request_id

    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Subscription invoice not found for CheckoutRequestID: %',
            p_checkout_request_id;

    END IF;


    -- ========================================================
    -- 3. IDEMPOTENCY
    -- ========================================================
    --
    -- If this invoice was already successfully processed,
    -- do NOT extend the subscription again.
    -- ========================================================

    IF v_invoice.status = 'PAID' THEN

        RETURN jsonb_build_object(

            'success',
            true,

            'already_processed',
            true,

            'invoice_id',
            v_invoice.id,

            'subscription_id',
            v_invoice.subscription_id,

            'status',
            'PAID',

            'mpesa_receipt',
            v_invoice.mpesa_receipt,

            'amount_kes',
            v_invoice.amount_kes

        );

    END IF;


    -- ========================================================
    -- 4. HANDLE FAILED / CANCELLED M-PESA PAYMENT
    -- ========================================================

    IF p_result_code IS NULL THEN

        RAISE EXCEPTION
            'M-Pesa result code is required';

    END IF;


    IF p_result_code <> 0 THEN

        UPDATE public.subscription_invoices

        SET

            status = 'FAILED',

            merchant_request_id =
                p_merchant_request_id,

            result_code =
                p_result_code,

            result_description =
                COALESCE(
                    p_result_description,
                    'M-Pesa payment failed'
                ),

            phone_number =
                COALESCE(
                    p_phone_number,
                    phone_number
                )

        WHERE id = v_invoice.id;


        RETURN jsonb_build_object(

            'success',
            true,

            'already_processed',
            false,

            'invoice_id',
            v_invoice.id,

            'subscription_id',
            v_invoice.subscription_id,

            'status',
            'FAILED',

            'result_code',
            p_result_code,

            'result_description',
            p_result_description

        );

    END IF;


    -- ========================================================
    -- 5. SUCCESSFUL PAYMENT MUST HAVE RECEIPT
    -- ========================================================

    IF p_mpesa_receipt IS NULL
       OR trim(p_mpesa_receipt) = '' THEN

        RAISE EXCEPTION
            'Successful M-Pesa payment is missing receipt number';

    END IF;


    -- ========================================================
    -- 6. SUCCESSFUL PAYMENT MUST HAVE AMOUNT
    -- ========================================================

    IF p_paid_amount IS NULL THEN

        RAISE EXCEPTION
            'Successful M-Pesa payment is missing amount';

    END IF;


    -- ========================================================
    -- 7. VERIFY PAYMENT AMOUNT
    -- ========================================================
    --
    -- The amount reported by M-Pesa must exactly match the
    -- invoice created during subscription checkout.
    -- ========================================================

    IF p_paid_amount <> v_invoice.amount_kes THEN

        UPDATE public.subscription_invoices

        SET

            status = 'FAILED',

            merchant_request_id =
                p_merchant_request_id,

            result_code =
                p_result_code,

            result_description =
                'M-Pesa payment amount does not match invoice amount',

            phone_number =
                COALESCE(
                    p_phone_number,
                    phone_number
                )

        WHERE id = v_invoice.id;


        RAISE EXCEPTION
            'M-Pesa amount mismatch. Expected %, received %',
            v_invoice.amount_kes,
            p_paid_amount;

    END IF;


    -- ========================================================
    -- 8. FIND AND LOCK SUBSCRIPTION
    -- ========================================================
    --
    -- Locking the subscription prevents concurrent callbacks
    -- from modifying the same subscription simultaneously.
    -- ========================================================

    SELECT *
    INTO v_subscription

    FROM public.landlord_subscriptions

    WHERE id = v_invoice.subscription_id

    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Subscription not found for invoice: %',
            v_invoice.id;

    END IF;


    -- ========================================================
    -- 9. DETERMINE BILLING PERIOD START
    -- ========================================================

    /*
     * New successful subscription payment starts now.
     *
     * However, if this subscription already has remaining
     * valid time, preserve that time and extend from the
     * existing period end.
     */

    IF v_subscription.current_period_end IS NOT NULL
       AND v_subscription.current_period_end > now() THEN

        v_base_date :=
            v_subscription.current_period_end;

    ELSE

        v_base_date :=
            now();

    END IF;


    -- ========================================================
    -- 10. DETERMINE NEW PERIOD START
    -- ========================================================

    v_new_period_start := now();


    -- ========================================================
    -- 11. DETERMINE NEW PERIOD END
    -- ========================================================

    IF v_subscription.billing_cycle = 'MONTHLY' THEN

        /*
         * Monthly subscriptions receive 30 days.
         */

        v_new_period_end :=
            v_base_date + interval '30 days';


    ELSIF v_subscription.billing_cycle = 'ANNUAL' THEN

        /*
         * Annual subscriptions receive 365 days.
         */

        v_new_period_end :=
            v_base_date + interval '365 days';


    ELSE

        RAISE EXCEPTION
            'Invalid billing cycle: %',
            v_subscription.billing_cycle;

    END IF;


    -- ========================================================
    -- 12. MARK INVOICE AS PAID
    -- ========================================================
    --
    -- The status condition protects against an unexpected
    -- second update after the invoice has already changed.
    -- ========================================================

    UPDATE public.subscription_invoices

    SET

        status =
            'PAID',

        mpesa_receipt =
            p_mpesa_receipt,

        merchant_request_id =
            p_merchant_request_id,

        phone_number =
            COALESCE(
                p_phone_number,
                phone_number
            ),

        result_code =
            p_result_code,

        result_description =
            COALESCE(
                p_result_description,
                'Payment successful'
            ),

        paid_at =
            now()

    WHERE id = v_invoice.id

      AND status = 'PENDING';


    -- ========================================================
    -- 13. ACTIVATE SUBSCRIPTION
    -- ========================================================

    UPDATE public.landlord_subscriptions

    SET

        status =
            'ACTIVE',

        current_period_start =
            v_new_period_start,

        current_period_end =
            v_new_period_end,

        grace_period_end =
            NULL,

        updated_at =
            now()

    WHERE id = v_subscription.id;


    -- ========================================================
    -- 14. RETURN SUCCESS
    -- ========================================================

    RETURN jsonb_build_object(

        'success',
        true,

        'already_processed',
        false,

        -- ----------------------------------------------------
        -- INVOICE
        -- ----------------------------------------------------

        'invoice_id',
        v_invoice.id,

        -- ----------------------------------------------------
        -- SUBSCRIPTION
        -- ----------------------------------------------------

        'subscription_id',
        v_subscription.id,

        'landlord_id',
        v_subscription.landlord_id,

        'plan_id',
        v_subscription.plan_id,

        'status',
        'ACTIVE',

        -- ----------------------------------------------------
        -- PAYMENT
        -- ----------------------------------------------------

        'mpesa_receipt',
        p_mpesa_receipt,

        'amount_kes',
        v_invoice.amount_kes,

        'phone_number',
        COALESCE(
            p_phone_number,
            v_invoice.phone_number
        ),

        'result_code',
        p_result_code,

        'result_description',
        COALESCE(
            p_result_description,
            'Payment successful'
        ),

        -- ----------------------------------------------------
        -- BILLING
        -- ----------------------------------------------------

        'billing_cycle',
        v_subscription.billing_cycle,

        'current_period_start',
        v_new_period_start,

        'current_period_end',
        v_new_period_end,

        -- ----------------------------------------------------
        -- TIMESTAMP
        -- ----------------------------------------------------

        'paid_at',
        now()

    );

END;

$$;


ALTER FUNCTION "public"."finalize_subscription_payment"("p_checkout_request_id" "text", "p_merchant_request_id" "text", "p_result_code" integer, "p_result_description" "text", "p_mpesa_receipt" "text", "p_paid_amount" numeric, "p_phone_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_subscription_paypal_payment"("p_invoice_id" "uuid", "p_order_id" "text", "p_capture_id" "text", "p_amount_usd" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  inv public.subscription_invoices%ROWTYPE;
  cycle text;
  now_ts timestamptz := now();
  period_end timestamptz;
  sub_id uuid;
  sub_type text;
  recipient_id uuid;
  recipient_email text;
BEGIN
  SELECT * INTO inv FROM public.subscription_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF inv.payment_provider <> 'PAYPAL' THEN RAISE EXCEPTION 'Invoice provider is not PayPal'; END IF;
  IF inv.currency <> 'USD' OR inv.amount_usd IS NULL OR inv.amount_usd <= 0 THEN RAISE EXCEPTION 'Invalid locked PayPal amount'; END IF;
  IF abs(inv.amount_usd - p_amount_usd) > 0.01 THEN RAISE EXCEPTION 'Captured amount does not match invoice amount'; END IF;
  IF inv.status = 'PAID' THEN RETURN jsonb_build_object('already_processed',true,'invoice_id',inv.id); END IF;
  IF inv.status <> 'PENDING' THEN RAISE EXCEPTION 'Invoice is not payable'; END IF;
  IF (inv.landlord_subscription_id IS NOT NULL) = (inv.real_estate_subscription_id IS NOT NULL) THEN RAISE EXCEPTION 'Invoice must reference exactly one subscription type'; END IF;

  IF inv.landlord_subscription_id IS NOT NULL THEN
    SELECT billing_cycle, landlord_id INTO cycle, recipient_id FROM public.landlord_subscriptions WHERE id=inv.landlord_subscription_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Landlord subscription not found'; END IF;
    sub_id:=inv.landlord_subscription_id; sub_type:='LANDLORD';
  ELSE
    SELECT billing_cycle, real_estate_id INTO cycle, recipient_id FROM public.real_estate_subscriptions WHERE id=inv.real_estate_subscription_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Real estate subscription not found'; END IF;
    sub_id:=inv.real_estate_subscription_id; sub_type:='REAL_ESTATE';
  END IF;

  IF cycle='ANNUAL' THEN period_end:=now_ts+interval '1 year'; ELSE period_end:=now_ts+interval '1 month'; END IF;

  UPDATE public.subscription_invoices
  SET status='PAID', provider_reference=p_order_id, provider_transaction_id=p_capture_id,
      paid_at=now_ts, billing_period_start=now_ts, billing_period_end=period_end,
      result_description='PayPal payment captured and finalized'
  WHERE id=inv.id;

  IF sub_type='LANDLORD' THEN
    UPDATE public.landlord_subscriptions SET status='ACTIVE', auto_renew=true,
      current_period_start=now_ts,current_period_end=period_end,grace_period_end=NULL,updated_at=now_ts
    WHERE id=sub_id;
  ELSE
    UPDATE public.real_estate_subscriptions SET status='ACTIVE', auto_renew=true,
      current_period_start=now_ts,current_period_end=period_end,grace_period_end=NULL,updated_at=now_ts
    WHERE id=sub_id;
  END IF;

  SELECT email INTO recipient_email FROM auth.users WHERE id=recipient_id;
  IF recipient_email IS NOT NULL THEN
    INSERT INTO public.notification_emails(recipient,subject,html_body,template_type,status,created_at)
    VALUES(
      recipient_email,
      'SakaHao subscription payment successful',
      format('<h2>Payment successful</h2><p>Your %s subscription payment was successfully received via PayPal.</p><p><strong>Invoice:</strong> %s<br><strong>Amount:</strong> KES %s (USD %s)<br><strong>Active until:</strong> %s</p>',sub_type,inv.id,inv.amount_kes,to_char(inv.amount_usd,'FM999999990.00'),to_char(period_end,'YYYY-MM-DD')),
      'SUBSCRIPTION_PAYMENT_SUCCESS','pending',now_ts
    );
  END IF;

  RETURN jsonb_build_object('processed',true,'invoice_id',inv.id,'subscription_id',sub_id,'subscription_type',sub_type,'period_end',period_end,'email_queued',recipient_email IS NOT NULL);
END;
$$;


ALTER FUNCTION "public"."finalize_subscription_paypal_payment"("p_invoice_id" "uuid", "p_order_id" "text", "p_capture_id" "text", "p_amount_usd" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."finalize_subscription_paypal_payment"("p_invoice_id" "uuid", "p_order_id" "text", "p_capture_id" "text", "p_amount_usd" numeric) IS 'Atomic server-side PayPal payment finalization for landlord and real-estate subscriptions, including success-email queueing.';



CREATE OR REPLACE FUNCTION "public"."generate_signup_otp"("p_email" "text", "p_full_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_email text := lower(trim(p_email));
  v_otp text;
  v_hash text;
  v_profile_id uuid := auth.uid();
  v_expires timestamptz;
  v_key text;
begin
  if v_profile_id is null then raise exception 'Authentication is required'; end if;
  if v_email is null or v_email = '' then raise exception 'Email is required'; end if;
  if p_full_name is null or btrim(p_full_name) = '' then raise exception 'Full name is required'; end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'signup_otp_encryption_key'
  limit 1;
  if v_key is null or v_key = '' then raise exception 'Signup OTP encryption key is not configured'; end if;

  v_otp := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_hash := encode(digest(v_otp, 'sha256'), 'hex');
  v_expires := now() + interval '1 minute';

  perform set_config('app.verification_workflow', 'true', true);

  insert into public.profiles (
    id, email, full_name, first_name, last_name, middle_name,
    email_verified, signup_otp_hash, signup_otp_encrypted,
    signup_otp_expires_at, signup_otp_attempts, signup_otp_last_sent_at,
    signup_otp_verified_at, updated_at
  )
  values (
    v_profile_id, v_email, btrim(p_full_name), '', '', '',
    false, v_hash, pgp_sym_encrypt(v_otp, v_key), v_expires, 0, now(), null, now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    signup_otp_hash = excluded.signup_otp_hash,
    signup_otp_encrypted = excluded.signup_otp_encrypted,
    signup_otp_expires_at = excluded.signup_otp_expires_at,
    signup_otp_attempts = 0,
    signup_otp_last_sent_at = now(),
    signup_otp_verified_at = null,
    updated_at = now();

  return jsonb_build_object('profile_id', v_profile_id, 'email', v_email, 'expires_at', v_expires);
end;
$$;


ALTER FUNCTION "public"."generate_signup_otp"("p_email" "text", "p_full_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_signup_otp"("p_email" "text", "p_full_name" "text", "p_encryption_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_email text := lower(trim(p_email));
  v_otp text;
  v_hash text;
  v_profile_id uuid;
  v_expires timestamptz;
begin
  if v_email = '' then raise exception 'Email is required'; end if;
  if p_full_name is null or btrim(p_full_name) = '' then raise exception 'Full name is required'; end if;
  if p_encryption_key is null or p_encryption_key = '' then raise exception 'OTP encryption key is not configured'; end if;

  v_otp := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_hash := encode(digest(v_otp, 'sha256'), 'hex');
  v_expires := now() + interval '1 minute';

  perform set_config('app.verification_workflow', 'true', true);

  select id into v_profile_id
  from public.profiles
  where lower(email) = v_email
  limit 1;

  if v_profile_id is not null then
    if exists (select 1 from public.profiles where id = v_profile_id and email_verified = true) then
      raise exception 'An account with this email already exists';
    end if;
    update public.profiles
    set full_name=btrim(p_full_name),
        signup_otp_hash=v_hash,
        signup_otp_encrypted=pgp_sym_encrypt(v_otp,p_encryption_key),
        signup_otp_expires_at=v_expires,
        signup_otp_attempts=0,
        signup_otp_last_sent_at=now(),
        signup_otp_verified_at=null,
        updated_at=now()
    where id=v_profile_id;
  else
    insert into public.profiles
      (id,email,full_name,first_name,last_name,middle_name,email_verified,
       signup_otp_hash,signup_otp_encrypted,signup_otp_expires_at,signup_otp_attempts,signup_otp_last_sent_at)
    values
      (gen_random_uuid(),v_email,btrim(p_full_name),'','','',false,
       v_hash,pgp_sym_encrypt(v_otp,p_encryption_key),v_expires,0,now())
    returning id into v_profile_id;
  end if;

  return jsonb_build_object('profile_id',v_profile_id,'email',v_email,'expires_at',v_expires);
end;
$$;


ALTER FUNCTION "public"."generate_signup_otp"("p_email" "text", "p_full_name" "text", "p_encryption_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_moving_location"("p_booking_id" "uuid") RETURNS TABLE("booking_id" "uuid", "mover_id" "uuid", "latitude" double precision, "longitude" double precision, "accuracy_meters" double precision, "speed_kph" double precision, "heading_degrees" double precision, "recorded_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select t.booking_id, t.mover_id, t.latitude, t.longitude,
         t.accuracy_meters, t.speed_kph, t.heading_degrees, t.recorded_at
  from public.moving_tracking_points t
  join public.bookings b on b.id = t.booking_id
  where t.booking_id = p_booking_id
    and b.status = 'in_progress'
    and (
      b.renter_id = auth.uid()
      or exists (
        select 1 from public.movers m
        where m.id = b.mover_id and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    )
  order by t.recorded_at desc
  limit 1;
$$;


ALTER FUNCTION "public"."get_active_moving_location"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_landlord_subscription"("p_landlord_id" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("subscription_id" "uuid", "plan_id" "uuid", "plan_name" "text", "subscription_status" "text", "billing_cycle" "text", "max_listings" integer, "max_units_per_listing" integer, "current_period_start" timestamp with time zone, "current_period_end" timestamp with time zone, "grace_period_end" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_landlord_id <> auth.uid() then raise exception 'Access denied'; end if;
  return query
  select ls.id,ls.plan_id,sp.name,ls.status,ls.billing_cycle,sp.max_listings,sp.max_units_per_listing,ls.current_period_start,ls.current_period_end,ls.grace_period_end
  from public.landlord_subscriptions ls
  join public.subscription_plans sp on sp.id=ls.plan_id
  where ls.landlord_id=auth.uid()
    and sp.audience='LANDLORD'
    and ((ls.status='ACTIVE' and ls.current_period_end>now()) or (ls.status='GRACE_PERIOD' and ls.grace_period_end is not null and ls.grace_period_end>now()))
  order by ls.created_at desc limit 1;
end;
$$;


ALTER FUNCTION "public"."get_current_landlord_subscription"("p_landlord_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_real_estate_subscription"("p_real_estate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("subscription_id" "uuid", "plan_id" "uuid", "plan_name" "text", "subscription_status" "text", "billing_cycle" "text", "max_listings" integer, "max_units_per_listing" integer, "current_period_start" timestamp with time zone, "current_period_end" timestamp with time zone, "grace_period_end" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ begin if auth.uid() is null then raise exception 'Authentication required'; end if; if p_real_estate_id <> auth.uid() then raise exception 'Access denied'; end if; return query select rs.id,rs.plan_id,sp.name,rs.status,rs.billing_cycle,sp.max_listings,sp.max_units_per_listing,rs.current_period_start,rs.current_period_end,rs.grace_period_end from public.real_estate_subscriptions rs join public.subscription_plans sp on sp.id=rs.plan_id and sp.audience='REAL_ESTATE' where rs.real_estate_id=auth.uid() and ((rs.status='ACTIVE' and rs.current_period_end>now()) or (rs.status='GRACE_PERIOD' and rs.grace_period_end is not null and rs.grace_period_end>now())) order by rs.created_at desc limit 1; end; $$;


ALTER FUNCTION "public"."get_current_real_estate_subscription"("p_real_estate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_landlord_listing_entitlement"("p_landlord_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_auth_user uuid := auth.uid();
  v_role text;
  v_landlord_status text;
  v_verification_status text;
  v_free_limit integer := 3;
  v_free_used integer := 0;
  v_free_remaining integer := 0;
  v_subscription_id uuid := null;
  v_plan_id uuid := null;
  v_subscription_plan text := null;
  v_subscription_status text := null;
  v_subscription_limit integer := null;
  v_max_units_per_listing integer := null;
  v_subscription_used integer := 0;
  v_subscription_remaining integer := null;
  v_individual_paid_listings integer := 0;
  v_individual_price numeric := 1000;
  v_can_start_listing boolean := false;
  v_can_create boolean := false;
  v_requires_subscription boolean := false;
  v_requires_individual_payment boolean := false;
  v_upgrade_available boolean := false;
  v_upgrade_target text := null;
  v_pms_access boolean := false;
begin
  if v_auth_user is null then raise exception 'Authentication required'; end if;
  if p_landlord_id is null then p_landlord_id := v_auth_user; end if;
  if p_landlord_id <> v_auth_user then raise exception 'You are not authorized to view this landlord entitlement'; end if;

  select lower(p.role), p.landlord_application_status, p.verification_status,
         coalesce(p.free_listings_used,0)
    into v_role, v_landlord_status, v_verification_status, v_free_used
    from public.profiles p where p.id = p_landlord_id;

  if not found then raise exception 'Landlord profile not found'; end if;

  if v_role is distinct from 'landlord' then
    return jsonb_build_object(
      'landlord_id',p_landlord_id,'authorized_landlord',false,
      'can_start_listing',false,'can_create',false,
      'requires_subscription',false,'requires_individual_payment',false,
      'reason',case when v_role='real_estate' then 'REAL_ESTATE_USES_SEPARATE_ENTITLEMENTS' else 'INVALID_ROLE' end
    );
  end if;

  v_can_start_listing := v_verification_status = 'verified'
    and v_landlord_status = 'approved';

  v_free_remaining := greatest(v_free_limit - v_free_used,0);

  select s.subscription_id,s.plan_id,s.plan_name,s.subscription_status,
         s.max_listings,s.max_units_per_listing
    into v_subscription_id,v_plan_id,v_subscription_plan,v_subscription_status,
         v_subscription_limit,v_max_units_per_listing
    from public.get_current_landlord_subscription(p_landlord_id) s;

  if v_subscription_id is not null then
    select count(*)::integer into v_subscription_used
      from public.subscription_listings sl
      join public.listings l on l.id=sl.listing_id
     where sl.subscription_id=v_subscription_id
       and sl.status='ACTIVE'
       and l.user_id=p_landlord_id;
    if v_subscription_limit is not null then
      v_subscription_remaining := greatest(v_subscription_limit-v_subscription_used,0);
    end if;
  end if;

  select count(*)::integer into v_individual_paid_listings
    from public.listing_payments lp
   where lp.user_id=p_landlord_id and lp.status='PAID';

  v_pms_access := v_subscription_id is not null;

  if v_can_start_listing and v_free_remaining > 0 then
    v_can_create := true;
  elsif v_can_start_listing and v_subscription_id is not null
    and (v_subscription_limit is null or v_subscription_remaining > 0) then
    v_can_create := true;
  elsif v_can_start_listing then
    v_can_create := false;
    v_requires_individual_payment := true;
    v_requires_subscription := v_subscription_id is null;
    if lower(coalesce(v_subscription_plan,''))='starter' then
      v_upgrade_available := true; v_upgrade_target := 'growth_or_pro';
    elsif lower(coalesce(v_subscription_plan,''))='growth' then
      v_upgrade_available := true; v_upgrade_target := 'pro';
    end if;
  end if;

  return jsonb_build_object(
    'landlord_id',p_landlord_id,'authorized_landlord',true,'role',v_role,
    'landlord_application_status',v_landlord_status,'verification_status',v_verification_status,
    'free_limit',v_free_limit,'free_listings_used',v_free_used,'free_listings_remaining',v_free_remaining,
    'subscription_id',v_subscription_id,'plan_id',v_plan_id,'subscription_plan',v_subscription_plan,
    'subscription_status',v_subscription_status,'subscription_limit',v_subscription_limit,
    'max_units_per_listing',v_max_units_per_listing,'subscription_listings_used',v_subscription_used,
    'subscription_listings_remaining',v_subscription_remaining,
    'individual_paid_listings',v_individual_paid_listings,'individual_listing_price_kes',v_individual_price,
    'can_start_listing',v_can_start_listing,'can_create',v_can_create,
    'requires_subscription',v_requires_subscription,'requires_individual_payment',v_requires_individual_payment,
    'pms_access',v_pms_access,'upgrade_available',v_upgrade_available,'upgrade_target',v_upgrade_target
  );
end;
$$;


ALTER FUNCTION "public"."get_landlord_listing_entitlement"("p_landlord_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_mover_booking_detail"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_b public.bookings%rowtype;
  v_m public.movers%rowtype;
  v_r public.profiles%rowtype;
  v_event public.mover_schedule_events%rowtype;
  v_contact_released boolean := false;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select b.* into v_b
  from public.bookings b
  join public.movers m on m.id = b.mover_id
  where b.id = p_booking_id and m.user_id = v_uid;

  if not found then raise exception 'Booking not found or unauthorized'; end if;

  v_contact_released := v_b.contact_released_at is not null;

  select * into v_m from public.movers where id = v_b.mover_id;
  select * into v_r from public.profiles where id = v_b.renter_id;
  select * into v_event from public.mover_schedule_events where booking_id = p_booking_id;

  return jsonb_build_object(
    'booking', to_jsonb(v_b),
    'renter', case when v_r.id is null then null else jsonb_build_object(
      'id', v_r.id,
      'full_name', v_r.full_name,
      'phone', case when v_contact_released then v_r.phone else null end,
      'profile_photo_url', v_r.profile_photo_url,
      'city', v_r.city,
      'county', v_r.county
    ) end,
    'mover', case when v_m.id is null then null else jsonb_build_object(
      'id', v_m.id,
      'driver_full_name', v_m.driver_full_name,
      'business_name', v_m.business_name,
      'phone', v_m.phone,
      'vehicle_type', v_m.vehicle_type,
      'number_plate', v_m.number_plate,
      'operating_city', v_m.operating_city,
      'operating_county', v_m.operating_county,
      'base_rate_kes', v_m.base_rate_kes,
      'rate_per_km_kes', v_m.rate_per_km_kes,
      'approval_status', v_m.approval_status
    ) end,
    'schedule', case when v_event.id is null then null else jsonb_build_object(
      'id', v_event.id,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at,
      'status', v_event.status,
      'title', v_event.title
    ) end,
    'response_deadline', coalesce(v_b.request_expires_at, v_b.requested_at + interval '30 minutes'),
    'can_respond', (v_b.status='pending' and coalesce(v_b.request_expires_at, v_b.requested_at + interval '30 minutes') > now()),
    'contact_released', v_contact_released
  );
end;
$$;


ALTER FUNCTION "public"."get_mover_booking_detail"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_mover_quote"("p_mover_id" "uuid", "p_distance_km" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_mover public.movers%rowtype;
  v_settings public.platform_settings%rowtype;
  v_distance numeric;
  v_mover_charge numeric;
  v_operational_markup numeric;
  v_renter_total numeric;
  v_commission numeric;
  v_net_mover numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;

  if p_distance_km is null or p_distance_km < 0 then
    raise exception 'Distance must be zero or greater';
  end if;

  select * into v_mover
  from public.movers
  where id = p_mover_id
    and approval_status = 'approved'
    and is_available = true;

  if not found then
    raise exception 'Mover is not approved or available';
  end if;

  select * into v_settings
  from public.platform_settings
  where id = true;

  v_distance := round(p_distance_km, 3);
  v_mover_charge := round(coalesce(v_mover.base_rate_kes, 0) + (v_distance * coalesce(v_mover.rate_per_km_kes, 0)), 2);
  v_operational_markup := round(v_mover_charge * v_settings.mover_operational_markup_rate, 2);
  v_renter_total := round(v_mover_charge + v_operational_markup, 2);
  v_commission := round(v_mover_charge * v_settings.mover_commission_rate, 2);
  v_net_mover := round(v_renter_total - v_commission, 2);

  return jsonb_build_object(
    'moverId', v_mover.id,
    'distanceKm', v_distance,
    'baseRateKes', round(coalesce(v_mover.base_rate_kes, 0), 2),
    'ratePerKmKes', round(coalesce(v_mover.rate_per_km_kes, 0), 2),
    'moverChargeKes', v_mover_charge,
    'operationalMarkupRate', v_settings.mover_operational_markup_rate,
    'operationalMarkupKes', v_operational_markup,
    'commissionRate', v_settings.mover_commission_rate,
    'commissionKes', v_commission,
    'renterTotalKes', v_renter_total,
    'netMoverPayableKes', v_net_mover,
    'currency', 'KES'
  );
end;
$$;


ALTER FUNCTION "public"."get_mover_quote"("p_mover_id" "uuid", "p_distance_km" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_mover_schedule_availability"("p_booking_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_mover public.movers%rowtype;
  v_intervals jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid availability range';
  end if;
  if p_to - p_from > interval '93 days' then
    raise exception 'Availability range is too large';
  end if;

  select b.* into v_booking
  from public.bookings b
  join public.movers m on m.id = b.mover_id
  where b.id = p_booking_id
    and (b.renter_id = v_uid or m.user_id = v_uid);

  if not found then
    raise exception 'Booking not found or unauthorized';
  end if;

  if v_booking.status not in ('confirmed','pending') then
    raise exception 'Booking is not eligible for schedule availability';
  end if;

  select * into v_mover
  from public.movers
  where id = v_booking.mover_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'starts_at', e.starts_at,
      'ends_at', e.ends_at,
      'status', e.status
    ) order by e.starts_at
  ), '[]'::jsonb)
  into v_intervals
  from public.mover_schedule_events e
  where e.mover_id = v_booking.mover_id
    and e.booking_id <> p_booking_id
    and e.status in ('TENTATIVE','CONFIRMED')
    and e.starts_at < p_to
    and e.ends_at > p_from;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'mover_id', v_booking.mover_id,
    'working_days', v_mover.working_days,
    'start_time', v_mover.start_time,
    'end_time', v_mover.end_time,
    'blocked_intervals', v_intervals
  );
end;
$$;


ALTER FUNCTION "public"."get_mover_schedule_availability"("p_booking_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_mover_tracking_booking"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid:=auth.uid();
  v_b public.bookings%rowtype;
  v_m public.movers%rowtype;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select b.* into v_b
  from public.bookings b
  where b.id=p_booking_id
    and (
      b.renter_id=v_uid
      or exists (select 1 from public.movers m where m.id=b.mover_id and m.user_id=v_uid)
      or exists (select 1 from public.profiles p where p.id=v_uid and p.role='admin')
    );
  if not found then raise exception 'Booking not found or unauthorized'; end if;

  select * into v_m from public.movers where id=v_b.mover_id;

  select jsonb_build_object(
    'booking', to_jsonb(v_b),
    'mover', case when v_m.id is null then null else jsonb_build_object(
      'id',v_m.id,
      'user_id',v_m.user_id,
      'driver_full_name',v_m.driver_full_name,
      'phone',v_m.phone,
      'profile_photo_url',v_m.profile_photo_url,
      'vehicle_type',v_m.vehicle_type,
      'number_plate',v_m.number_plate,
      'operating_city',v_m.operating_city,
      'operating_county',v_m.operating_county,
      'is_available',v_m.is_available,
      'current_latitude',v_m.current_latitude,
      'current_longitude',v_m.current_longitude,
      'location_updated_at',v_m.location_updated_at,
      'approval_status',v_m.approval_status
    ) end,
    'tracking_points', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.recorded_at desc)
      from (
        select t.* from public.moving_tracking_points t
        where t.booking_id=p_booking_id
        order by t.recorded_at desc
        limit 50
      ) t
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end; $$;


ALTER FUNCTION "public"."get_mover_tracking_booking"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_available_pms_listings"() RETURNS TABLE("listing_id" "uuid", "title" "text", "city" "text", "price_kes" numeric, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

    SELECT
        l.id,
        l.title,
        l.city,
        l.price_kes,
        l.created_at

    FROM public.listings l

    WHERE l.user_id = auth.uid()

      /*
       * Listing must not already belong
       * to the current subscription.
       */
      AND NOT EXISTS (

          SELECT 1

          FROM public.subscription_listings sl

          INNER JOIN public.get_current_landlord_subscription(
              auth.uid()
          ) s

              ON s.subscription_id = sl.subscription_id

          WHERE sl.listing_id = l.id
            AND sl.status = 'ACTIVE'
      )

      /*
       * Do not offer a listing that is already
       * marked as property-management managed.
       */
      AND COALESCE(l.is_property_management, false) = false

    ORDER BY l.created_at DESC;

$$;


ALTER FUNCTION "public"."get_my_available_pms_listings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_landlord_payment_methods"() RETURNS TABLE("id" "uuid", "provider" "text", "mpesa_method" "text", "display_name" "text", "paybill_number" "text", "paybill_account" "text", "till_number" "text", "paypal_email" "text", "is_default" boolean, "is_active" boolean, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  select pm.id, pm.provider, pm.mpesa_method, pm.display_name,
         pm.paybill_number, pm.paybill_account, pm.till_number,
         pm.paypal_email, pm.is_default, pm.is_active,
         pm.created_at, pm.updated_at
  from public.landlord_payment_methods pm
  where pm.landlord_id = auth.uid()
  order by pm.is_default desc, pm.created_at asc;
$$;


ALTER FUNCTION "public"."get_my_landlord_payment_methods"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_pms_listings"() RETURNS TABLE("subscription_listing_id" "uuid", "subscription_id" "uuid", "listing_id" "uuid", "listing_title" "text", "listing_city" "text", "listing_price_kes" numeric, "status" "text", "activated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

    SELECT
        sl.id,
        sl.subscription_id,
        sl.listing_id,
        l.title,
        l.city,
        l.price_kes,
        sl.status,
        sl.activated_at

    FROM public.subscription_listings sl

    INNER JOIN public.landlord_subscriptions ls
        ON ls.id = sl.subscription_id

    INNER JOIN public.listings l
        ON l.id = sl.listing_id

    WHERE ls.landlord_id = auth.uid()

      AND l.user_id = auth.uid()

      AND sl.status = 'ACTIVE'

      AND EXISTS (
          SELECT 1
          FROM public.get_current_landlord_subscription(
              auth.uid()
          ) s
          WHERE s.subscription_id = sl.subscription_id
      )

    ORDER BY sl.activated_at ASC;

$$;


ALTER FUNCTION "public"."get_my_pms_listings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_pms_subscription"() RETURNS TABLE("subscription_id" "uuid", "landlord_id" "uuid", "plan_id" "uuid", "plan_name" "text", "max_listings" integer, "billing_cycle" "text", "status" "text", "current_period_start" timestamp with time zone, "current_period_end" timestamp with time zone, "grace_period_end" timestamp with time zone, "auto_renew" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT
        s.subscription_id,
        auth.uid(),
        s.plan_id,
        s.plan_name,
        s.max_listings,
        s.billing_cycle,
        s.subscription_status,
        s.current_period_start,
        s.current_period_end,
        s.grace_period_end,
        ls.auto_renew
    FROM public.get_current_landlord_subscription(auth.uid()) s
    INNER JOIN public.landlord_subscriptions ls
        ON ls.id = s.subscription_id
    LIMIT 1;
$$;


ALTER FUNCTION "public"."get_my_pms_subscription"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_pms_unit_count"("p_subscription_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

DECLARE

    v_subscription_id uuid;
    v_count integer;

BEGIN

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;


    IF p_subscription_id IS NOT NULL THEN

        SELECT s.subscription_id
        INTO v_subscription_id

        FROM public.get_current_landlord_subscription(
            auth.uid()
        ) s

        WHERE s.subscription_id = p_subscription_id;


        IF v_subscription_id IS NULL THEN

            RAISE EXCEPTION
                'Subscription not found, expired, or not owned by current user';

        END IF;

    ELSE

        SELECT s.subscription_id
        INTO v_subscription_id

        FROM public.get_current_landlord_subscription(
            auth.uid()
        ) s;

    END IF;


    IF v_subscription_id IS NULL THEN
        RETURN 0;
    END IF;


    SELECT COUNT(*)::integer
    INTO v_count

    FROM public.subscription_listings sl

    WHERE sl.subscription_id = v_subscription_id
      AND sl.status = 'ACTIVE';


    RETURN COALESCE(v_count, 0);

END;

$$;


ALTER FUNCTION "public"."get_my_pms_unit_count"("p_subscription_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_pms_units"("p_listing_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("unit_id" "uuid", "listing_id" "uuid", "listing_title" "text", "unit_number" "text", "unit_type" "text", "rent" numeric, "beds" integer, "baths" integer, "availability" "text", "renter_name" "text", "renter_assoc_id" "uuid", "renter_phone" "text", "renter_email" "text", "lease_start" "date", "lease_end" "date", "assoc_status" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
SELECT
pu.id AS unit_id,
pu.listing_id,
l.title AS listing_title,
pu.unit_number,
pu.unit_type,
pu.rent,
pu.beds,
pu.baths,
pu.availability,
ra.renter_name,
ra.id AS renter_assoc_id,
ra.renter_phone,
ra.renter_email,
ra.lease_start,
ra.lease_end,
ra.status AS assoc_status
FROM public.property_units pu
INNER JOIN public.listings l ON l.id = pu.listing_id
LEFT JOIN public.renter_unit_associations ra
ON ra.unit_id = pu.id AND ra.status = 'ACTIVE'
WHERE pu.user_id = auth.uid()
AND (p_listing_id IS NULL OR pu.listing_id = p_listing_id)
ORDER BY l.title, pu.unit_number;
$$;


ALTER FUNCTION "public"."get_my_pms_units"("p_listing_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "role" "text",
    "verification_status" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "national_id" "text" DEFAULT ''::"text",
    "phone" "text" DEFAULT ''::"text",
    "profile_photo_url" "text" DEFAULT ''::"text",
    "id_photo_url" "text" DEFAULT ''::"text",
    "selfie_url" "text" DEFAULT ''::"text",
    "city" "text" DEFAULT ''::"text",
    "county" "text" DEFAULT ''::"text",
    "is_agency" boolean DEFAULT false NOT NULL,
    "free_listings_used" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text" DEFAULT ''::"text" NOT NULL,
    "last_name" "text" DEFAULT ''::"text" NOT NULL,
    "middle_name" "text" DEFAULT ''::"text" NOT NULL,
    "id_document_url" "text" DEFAULT ''::"text" NOT NULL,
    "id_document_type" "text" DEFAULT ''::"text" NOT NULL,
    "landlord_application_status" "text" DEFAULT 'not_requested'::"text" NOT NULL,
    "mover_application_status" "text" DEFAULT 'not_requested'::"text" NOT NULL,
    "email_verified" boolean DEFAULT false,
    "role_selected_at" timestamp with time zone,
    "kyc_completed" boolean DEFAULT false NOT NULL,
    "signup_otp_hash" "text",
    "signup_otp_expires_at" timestamp with time zone,
    "signup_otp_attempts" integer DEFAULT 0 NOT NULL,
    "signup_otp_last_sent_at" timestamp with time zone,
    "signup_otp_verified_at" timestamp with time zone,
    "signup_otp_encrypted" "text",
    "signup_otp_trial_count" integer DEFAULT 0 NOT NULL,
    "signup_verification_started_at" timestamp with time zone,
    "signup_verification_deadline_at" timestamp with time zone,
    "real_estate_application_status" "text" DEFAULT 'not_requested'::"text" NOT NULL,
    "admin_review_note" "text",
    CONSTRAINT "profiles_id_document_type_check" CHECK (("id_document_type" = ANY (ARRAY[''::"text", 'national_id'::"text", 'passport'::"text"]))),
    CONSTRAINT "profiles_landlord_application_status_check" CHECK (("landlord_application_status" = ANY (ARRAY['not_requested'::"text", 'pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "profiles_mover_application_status_check" CHECK (("mover_application_status" = ANY (ARRAY['not_requested'::"text", 'pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "profiles_real_estate_application_status_check" CHECK (("real_estate_application_status" = ANY (ARRAY['not_requested'::"text", 'pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['renter'::"text", 'landlord'::"text", 'mover'::"text", 'real_estate'::"text", 'admin'::"text"]))),
    CONSTRAINT "profiles_signup_otp_attempts_nonnegative" CHECK (("signup_otp_attempts" >= 0)),
    CONSTRAINT "profiles_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['unverified'::"text", 'pending_verification'::"text", 'verified'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."admin_review_note" IS 'Admin-only review note for moderation/approval workflows; separate from OTP, email verification, KYC, and application status.';



CREATE OR REPLACE FUNCTION "public"."get_my_profile"() RETURNS "public"."profiles"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select * from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_rent_payable_periods"("p_assoc_id" "uuid", "p_requested_months" integer DEFAULT 1) RETURNS TABLE("period_year" integer, "period_month" integer, "period_start" "date", "due_date" "date", "amount_kes" numeric, "status" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_assoc public.renter_unit_associations%rowtype;
  v_unit public.property_units%rowtype;
  v_months integer := greatest(1, least(coalesce(p_requested_months, 1), 3));
  v_start date;
  v_end date;
begin
  select * into v_assoc
  from public.renter_unit_associations
  where id = p_assoc_id
    and renter_user_id = auth.uid()
    and upper(status) = 'ACTIVE';

  if not found then
    raise exception 'Renter association not found or not accessible';
  end if;

  select * into v_unit
  from public.property_units
  where id = v_assoc.unit_id;

  if not found then
    raise exception 'Property unit not found';
  end if;

  if coalesce(v_unit.payment_tracking_enabled, false) = false then
    raise exception 'Payment tracking is disabled for this unit';
  end if;

  -- Start at the lease start, so overdue unpaid periods are not skipped.
  -- If no lease start exists, start with the current month.
  v_start := greatest(
    date_trunc('month', coalesce(v_assoc.lease_start, current_date))::date,
    date_trunc('month', current_date - interval '36 months')::date
  );
  v_end := coalesce(
    date_trunc('month', v_assoc.lease_end)::date,
    date_trunc('month', current_date + interval '36 months')::date
  );

  if v_end < v_start then
    return;
  end if;

  return query
  with candidate_months as (
    select gs::date as period_start
    from generate_series(v_start, v_end, interval '1 month') gs
  ),
  unpaid as (
    select
      extract(year from cm.period_start)::integer as y,
      extract(month from cm.period_start)::integer as m,
      cm.period_start,
      least(
        (cm.period_start + (v_unit.rent_due_day - 1) * interval '1 day')::date,
        (cm.period_start + interval '1 month - 1 day')::date
      ) as due_date
    from candidate_months cm
    where not exists (
      select 1
      from public.rent_payments rp
      where rp.renter_assoc_id = v_assoc.id
        and rp.period_year = extract(year from cm.period_start)::integer
        and rp.period_month = extract(month from cm.period_start)::integer
        and upper(rp.status) = 'PAID'
    )
    order by cm.period_start
    limit v_months
  )
  select u.y, u.m, u.period_start, u.due_date, v_unit.rent, 'UNPAID'::text
  from unpaid u
  order by u.period_start;
end;
$$;


ALTER FUNCTION "public"."get_my_rent_payable_periods"("p_assoc_id" "uuid", "p_requested_months" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_rent_summary"() RETURNS TABLE("total_units" integer, "occupied_units" integer, "vacant_units" integer, "total_renters" integer, "monthly_rent_due" numeric, "monthly_rent_paid" numeric, "monthly_rent_outstanding" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
with my_units as (
  select pu.id, pu.availability, pu.rent
  from public.property_units pu
  where pu.user_id = auth.uid()
),
my_active_assoc as (
  select ra.unit_id, pu.rent
  from public.renter_unit_associations ra
  join public.property_units pu on pu.id = ra.unit_id
  where ra.landlord_id = auth.uid()
    and ra.status = 'ACTIVE'
    and pu.payment_tracking_enabled = true
),
current_month_payments as (
  select rp.renter_assoc_id, rp.amount_kes, rp.status
  from public.rent_payments rp
  where rp.landlord_id = auth.uid()
    and rp.period_year = extract(year from now())::integer
    and rp.period_month = extract(month from now())::integer
)
select
  (select count(*)::integer from my_units),
  (select count(*)::integer from my_active_assoc),
  (select count(*)::integer from my_units mu
    where not exists (
      select 1 from public.renter_unit_associations ra
      where ra.unit_id = mu.id and ra.status = 'ACTIVE'
    )),
  (select count(*)::integer from my_active_assoc),
  (select coalesce(sum(rent),0) from my_active_assoc),
  (select coalesce(sum(amount_kes),0) from current_month_payments where status = 'PAID'),
  greatest(
    (select coalesce(sum(rent),0) from my_active_assoc)
    - (select coalesce(sum(amount_kes),0) from current_month_payments where status = 'PAID'),
    0
  );
$$;


ALTER FUNCTION "public"."get_my_rent_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_renter_associations"() RETURNS TABLE("assoc_id" "uuid", "unit_id" "uuid", "listing_id" "uuid", "unit_number" "text", "renter_name" "text", "renter_phone" "text", "renter_email" "text", "rent_amount" numeric, "unit_rent" numeric, "payment_tracking_enabled" boolean, "rent_due_day" smallint, "lease_start" "date", "lease_end" "date", "status" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT ra.id,ra.unit_id,pu.listing_id,pu.unit_number,ra.renter_name,ra.renter_phone,ra.renter_email,pu.rent,pu.rent,pu.payment_tracking_enabled,pu.rent_due_day,ra.lease_start,ra.lease_end,ra.status,ra.created_at FROM public.renter_unit_associations ra JOIN public.property_units pu ON pu.id=ra.unit_id WHERE ra.renter_user_id=auth.uid() AND ra.status='ACTIVE' ORDER BY ra.created_at DESC $$;


ALTER FUNCTION "public"."get_my_renter_associations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_subscription_access"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_subscription_id uuid;
  v_plan_id uuid;
  v_plan_name text;
  v_max_units_per_listing integer;
  v_billing_cycle text;
  v_status text;
  v_current_period_start timestamptz;
  v_current_period_end timestamptz;
  v_grace_period_end timestamptz;
  v_days_remaining integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('authenticated', false, 'is_landlord', false, 'status', 'UNAUTHENTICATED', 'can_manage', false);
  end if;

  select p.role into v_role from public.profiles p where p.id = auth.uid();

  if v_role is distinct from 'landlord' then
    return jsonb_build_object('authenticated', true, 'is_landlord', false, 'role', v_role, 'has_subscription', false, 'status', 'NOT_LANDLORD', 'can_manage', false);
  end if;

  select s.subscription_id, s.plan_id, s.plan_name, s.max_units_per_listing,
         s.billing_cycle, s.subscription_status, s.current_period_start,
         s.current_period_end, s.grace_period_end
  into v_subscription_id, v_plan_id, v_plan_name, v_max_units_per_listing, v_billing_cycle,
       v_status, v_current_period_start, v_current_period_end, v_grace_period_end
  from public.get_current_landlord_subscription(auth.uid()) s;

  if v_subscription_id is null then
    return jsonb_build_object('authenticated', true, 'is_landlord', true, 'role', v_role,
      'has_subscription', false, 'status', 'EXPIRED', 'can_manage', false,
      'can_view_properties', true, 'can_view_payment_history', true,
      'can_create_units', false, 'can_send_sms', false, 'can_reconcile_rent', false);
  end if;

  if v_status = 'ACTIVE' then
    v_days_remaining := greatest(0, ceil(extract(epoch from (v_current_period_end - now())) / 86400))::integer;
    return jsonb_build_object('authenticated', true, 'is_landlord', true, 'role', v_role,
      'has_subscription', true, 'subscription_id', v_subscription_id, 'plan_id', v_plan_id,
      'plan_name', v_plan_name, 'max_units_per_listing', v_max_units_per_listing,
      'billing_cycle', v_billing_cycle, 'status', 'ACTIVE',
      'current_period_start', v_current_period_start, 'current_period_end', v_current_period_end,
      'grace_period_end', v_grace_period_end, 'days_remaining', v_days_remaining,
      'auto_renew', (select ls.auto_renew from public.landlord_subscriptions ls where ls.id = v_subscription_id),
      'can_manage', true, 'can_view_properties', true, 'can_view_payment_history', true,
      'can_create_units', true, 'can_send_sms', true, 'can_reconcile_rent', true);
  end if;

  if v_status = 'GRACE_PERIOD' then
    v_days_remaining := greatest(0, ceil(extract(epoch from (v_grace_period_end - now())) / 86400))::integer;
    return jsonb_build_object('authenticated', true, 'is_landlord', true, 'role', v_role,
      'has_subscription', true, 'subscription_id', v_subscription_id, 'plan_id', v_plan_id,
      'plan_name', v_plan_name, 'max_units_per_listing', v_max_units_per_listing,
      'billing_cycle', v_billing_cycle, 'status', 'GRACE_PERIOD',
      'current_period_start', v_current_period_start, 'current_period_end', v_current_period_end,
      'grace_period_end', v_grace_period_end, 'grace_days_remaining', v_days_remaining,
      'can_manage', true, 'can_view_properties', true, 'can_view_payment_history', true,
      'can_create_units', true, 'can_send_sms', true, 'can_reconcile_rent', true);
  end if;

  return jsonb_build_object('authenticated', true, 'is_landlord', true, 'role', v_role,
    'has_subscription', false, 'status', 'EXPIRED', 'can_manage', false,
    'can_view_properties', true, 'can_view_payment_history', true,
    'can_create_units', false, 'can_send_sms', false, 'can_reconcile_rent', false);
end;
$$;


ALTER FUNCTION "public"."get_my_subscription_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_real_estate_listing_entitlement"("p_real_estate_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_auth_user uuid := auth.uid(); v_role text; v_verification_status text;
  v_free_limit integer := 3; v_free_used integer := 0; v_free_remaining integer := 0;
  v_subscription_id uuid := null; v_plan_id uuid := null; v_subscription_plan text := null;
  v_subscription_status text := null; v_billing_cycle text := null; v_subscription_limit integer := null;
  v_max_units_per_listing integer := null; v_subscription_used integer := 0;
  v_subscription_remaining integer := null; v_individual_paid_listings integer := 0;
  v_individual_price numeric := 1000; v_can_start_listing boolean := false;
  v_can_create boolean := false; v_requires_subscription boolean := false;
  v_requires_individual_payment boolean := false; v_upgrade_available boolean := false;
  v_upgrade_target text := null;
BEGIN
  IF v_auth_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_real_estate_id IS NULL THEN p_real_estate_id := v_auth_user; END IF;
  IF p_real_estate_id <> v_auth_user THEN RAISE EXCEPTION 'Access denied'; END IF;

  SELECT lower(p.role), p.verification_status, coalesce(p.free_listings_used,0)
    INTO v_role, v_verification_status, v_free_used
    FROM public.profiles p WHERE p.id = p_real_estate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Real Estate profile not found'; END IF;
  IF v_role IS DISTINCT FROM 'real_estate' THEN
    RETURN jsonb_build_object('real_estate_id',p_real_estate_id,'authorized_real_estate',false,
      'can_start_listing',false,'can_create',false,'requires_subscription',false,
      'requires_individual_payment',false,'reason','NOT_REAL_ESTATE');
  END IF;

  v_can_start_listing := v_verification_status = 'verified';
  v_free_remaining := greatest(v_free_limit-v_free_used,0);

  SELECT s.subscription_id,s.plan_id,s.plan_name,s.subscription_status,s.billing_cycle,
         s.max_listings,s.max_units_per_listing
    INTO v_subscription_id,v_plan_id,v_subscription_plan,v_subscription_status,v_billing_cycle,
         v_subscription_limit,v_max_units_per_listing
    FROM public.get_current_real_estate_subscription(p_real_estate_id) s;

  IF v_subscription_id IS NOT NULL THEN
    SELECT count(*)::integer INTO v_subscription_used
      FROM public.subscription_listings sl
      JOIN public.listings l ON l.id=sl.listing_id
     WHERE sl.real_estate_subscription_id=v_subscription_id
       AND sl.status='ACTIVE' AND l.user_id=p_real_estate_id;
    IF v_subscription_limit IS NOT NULL THEN
      v_subscription_remaining := greatest(v_subscription_limit-v_subscription_used,0);
    END IF;
  END IF;

  SELECT count(*)::integer INTO v_individual_paid_listings
    FROM public.listing_payments lp
   WHERE lp.user_id=p_real_estate_id AND lp.status='PAID';

  IF v_can_start_listing AND v_free_remaining > 0 THEN
    v_can_create := true;
  ELSIF v_can_start_listing AND v_subscription_id IS NOT NULL
    AND (v_subscription_limit IS NULL OR v_subscription_remaining > 0) THEN
    v_can_create := true;
  ELSIF v_can_start_listing THEN
    v_requires_individual_payment := true;
    v_requires_subscription := v_subscription_id IS NULL;
    IF lower(coalesce(v_subscription_plan,''))='starter' THEN
      v_upgrade_available := true; v_upgrade_target := 'growth_or_pro';
    ELSIF lower(coalesce(v_subscription_plan,''))='growth' THEN
      v_upgrade_available := true; v_upgrade_target := 'pro';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'real_estate_id',p_real_estate_id,'authorized_real_estate',true,'allowed',v_can_create,
    'can_start_listing',v_can_start_listing,'can_create',v_can_create,'role',v_role,
    'verification_status',v_verification_status,'free_limit',v_free_limit,
    'free_listings_used',v_free_used,'free_listings_remaining',v_free_remaining,
    'subscription_id',v_subscription_id,'plan_id',v_plan_id,'subscription_plan',v_subscription_plan,
    'subscription_status',v_subscription_status,'billing_cycle',v_billing_cycle,
    'subscription_limit',v_subscription_limit,'max_listings',v_subscription_limit,
    'max_units_per_listing',v_max_units_per_listing,'subscription_listings_used',v_subscription_used,
    'subscription_listings_remaining',v_subscription_remaining,
    'individual_paid_listings',v_individual_paid_listings,'individual_listing_price_kes',v_individual_price,
    'requires_subscription',v_requires_subscription,'requires_individual_payment',v_requires_individual_payment,
    'upgrade_available',v_upgrade_available,'upgrade_target',v_upgrade_target
  );
END;
$$;


ALTER FUNCTION "public"."get_real_estate_listing_entitlement"("p_real_estate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_rent_payment_destination"("p_payment_method_id" "uuid", "p_unit_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_landlord_id uuid;
  v_method public.landlord_payment_methods%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select pu.user_id
    into v_landlord_id
  from public.property_units pu
  where pu.id = p_unit_id;

  if v_landlord_id is null then
    raise exception 'Unit not found';
  end if;

  -- Only the unit's landlord, an active renter of that unit, or an admin
  -- may resolve the payment destination.
  if v_landlord_id <> v_uid
     and not exists (
       select 1
       from public.renter_unit_associations ra
       where ra.unit_id = p_unit_id
         and ra.renter_user_id = v_uid
         and upper(ra.status) = 'ACTIVE'
     )
     and not exists (
       select 1
       from public.profiles p
       where p.id = v_uid
         and p.role = 'admin'
     ) then
    raise exception 'Not authorized to view this payment destination';
  end if;

  select *
    into v_method
  from public.landlord_payment_methods
  where id = p_payment_method_id
    and landlord_id = v_landlord_id
    and is_active = true;

  if not found then
    raise exception 'Payment method is not authorized for this unit';
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'payment_method_id', v_method.id,
    'provider', v_method.provider,
    'mpesa_method', v_method.mpesa_method,
    'display_name', v_method.display_name,
    'paybill_number', v_method.paybill_number,
    'paybill_account', v_method.paybill_account,
    'till_number', v_method.till_number,
    'paypal_email', v_method.paypal_email
  ));
end;
$$;


ALTER FUNCTION "public"."get_rent_payment_destination"("p_payment_method_id" "uuid", "p_unit_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_rent_payments_for_assoc"("p_assoc_id" "uuid") RETURNS TABLE("id" "uuid", "renter_assoc_id" "uuid", "unit_id" "uuid", "amount_kes" numeric, "period_year" integer, "period_month" integer, "status" "text", "mpesa_receipt" "text", "paid_at" timestamp with time zone, "payment_provider" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
SELECT
rp.id,
rp.renter_assoc_id,
rp.unit_id,
rp.amount_kes,
rp.period_year,
rp.period_month,
rp.status,
rp.mpesa_receipt,
rp.paid_at,
rp.payment_provider,
rp.created_at
FROM public.rent_payments rp
WHERE rp.renter_assoc_id = p_assoc_id
AND rp.landlord_id = auth.uid()
ORDER BY rp.period_year DESC, rp.period_month DESC;
$$;


ALTER FUNCTION "public"."get_rent_payments_for_assoc"("p_assoc_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_renter_invitation_preview"("p_token" "text") RETURNS TABLE("renter_name" "text", "unit_number" "text", "unit_type" "text", "rent_amount" numeric, "property_title" "text", "property_city" "text", "invitation_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_hash text := encode(digest(p_token, 'sha256'), 'hex');
begin
  return query
  select
    ra.renter_name,
    pu.unit_number,
    pu.unit_type,
    ra.rent_amount,
    l.title,
    l.city,
    case
      when ra.status <> 'PENDING' then ra.status
      when ra.invite_expires_at is not null and ra.invite_expires_at < now() then 'EXPIRED'
      else ra.status
    end
  from public.renter_unit_associations ra
  join public.property_units pu on pu.id = ra.unit_id
  join public.listings l on l.id = pu.listing_id
  where ra.invite_token_hash = v_hash;
end;
$$;


ALTER FUNCTION "public"."get_renter_invitation_preview"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_renter_payment_history"("p_assoc_id" "uuid") RETURNS TABLE("id" "uuid", "amount_kes" numeric, "period_year" integer, "period_month" integer, "status" "text", "payment_provider" "text", "payment_method" "text", "mpesa_receipt" "text", "paid_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT rp.id,rp.amount_kes,rp.period_year,rp.period_month,rp.status,rp.payment_provider,rp.payment_method,rp.mpesa_receipt,rp.paid_at,rp.created_at FROM public.rent_payments rp JOIN public.renter_unit_associations ra ON ra.id=rp.renter_assoc_id WHERE rp.renter_assoc_id=p_assoc_id AND ra.renter_user_id=auth.uid() ORDER BY rp.period_year DESC,rp.period_month DESC $$;


ALTER FUNCTION "public"."get_renter_payment_history"("p_assoc_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_renter_rent_summary"("p_renter_assoc_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_assoc record;
  v_paid_through date;
  v_next date;
begin
  select ra.*, pu.rent, pu.rent_due_day, pu.listing_id, pu.unit_number, pu.payment_tracking_enabled, l.property_name, l.title as listing_title, l.user_id as listing_user_id
  into v_assoc
  from renter_unit_associations ra
  join property_units pu on pu.id=ra.unit_id
  join listings l on l.id=pu.listing_id
  where ra.id=p_renter_assoc_id and ra.renter_user_id=auth.uid() and ra.status='ACTIVE';
  if not found then raise exception 'Active renter association not found'; end if;
  select make_date(period_year, period_month, 1) into v_paid_through from rent_payments where renter_assoc_id=v_assoc.id and status='PAID' order by period_year desc, period_month desc limit 1;
  v_next := coalesce((v_paid_through + interval '1 month')::date, make_date(extract(year from current_date)::int, extract(month from current_date)::int, 1));
  return jsonb_build_object('association_id',v_assoc.id,'unit_id',v_assoc.unit_id,'listing_id',v_assoc.listing_id,'unit_number',v_assoc.unit_number,'rent',v_assoc.rent,'rent_due_day',v_assoc.rent_due_day,'payment_tracking_enabled',v_assoc.payment_tracking_enabled,'property_name',v_assoc.property_name,'listing_title',v_assoc.listing_title,'landlord_id',v_assoc.landlord_id,'paid_through',v_paid_through,'next_payment_period',to_char(v_next,'YYYY-MM'),'landlord_name',(select full_name from profiles where id=v_assoc.landlord_id));
end;
$$;


ALTER FUNCTION "public"."get_renter_rent_summary"("p_renter_assoc_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_signup_otp_for_email"("p_email" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_otp text;
  v_key text;
begin
  select decrypted_secret
    into v_key
  from vault.decrypted_secrets
  where name = 'signup_otp_encryption_key'
  limit 1;

  if v_key is null or v_key = '' then
    raise exception 'Signup OTP encryption key is not configured';
  end if;

  select pgp_sym_decrypt(signup_otp_encrypted::bytea, v_key)
    into v_otp
  from public.profiles
  where lower(email) = lower(trim(p_email))
    and email_verified = false
    and signup_otp_encrypted is not null
    and signup_otp_expires_at > now()
  limit 1;

  if v_otp is null then
    raise exception 'No active signup verification code found';
  end if;

  return v_otp;
end;
$$;


ALTER FUNCTION "public"."get_signup_otp_for_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_signup_otp_for_email"("p_email" "text", "p_encryption_key" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare v_otp text;
begin
  if p_encryption_key is null or p_encryption_key='' then raise exception 'OTP encryption key is not configured'; end if;
  select pgp_sym_decrypt(signup_otp_encrypted::bytea,p_encryption_key)
    into v_otp
  from public.profiles
  where lower(email)=lower(trim(p_email))
    and email_verified=false
    and signup_otp_expires_at > now()
  limit 1;
  if v_otp is null then raise exception 'No active signup verification code found'; end if;
  return v_otp;
end;
$$;


ALTER FUNCTION "public"."get_signup_otp_for_email"("p_email" "text", "p_encryption_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare v_result jsonb;
begin
  insert into public.profiles (id,email,full_name,verification_status,email_verified,signup_otp_attempts)
  values (new.id,lower(trim(coalesce(new.email,''))),coalesce(new.raw_user_meta_data ->> 'full_name',''),'unverified',false,0)
  on conflict (id) do update set
    email = excluded.email,
    full_name = case when public.profiles.full_name is null or trim(public.profiles.full_name) = '' then excluded.full_name else public.profiles.full_name end;

  select public.issue_signup_otp(lower(trim(coalesce(new.email,'')))) into v_result;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_current_user_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_current_user_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_listing_pms_managed"("p_listing_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

    SELECT EXISTS (

        SELECT 1

        FROM public.subscription_listings sl

        INNER JOIN public.listings l
            ON l.id = sl.listing_id

        WHERE sl.listing_id = p_listing_id

          AND sl.status = 'ACTIVE'

          AND l.user_id = auth.uid()

          AND EXISTS (
              SELECT 1
              FROM public.get_current_landlord_subscription(
                  auth.uid()
              ) s
              WHERE s.subscription_id = sl.subscription_id
          )

    );

$$;


ALTER FUNCTION "public"."is_listing_pms_managed"("p_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_signup_otp"("p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_profile_id uuid;
  v_otp text;
  v_key text;
  v_now timestamptz := now();
  v_expires timestamptz;
  v_last_sent timestamptz;
  v_trial_count integer;
  v_started_at timestamptz;
  v_deadline_at timestamptz;
begin
  perform set_config('app.verification_workflow', 'true', true);

  select id, signup_otp_last_sent_at, coalesce(signup_otp_trial_count, 0),
         signup_verification_started_at, signup_verification_deadline_at
    into v_profile_id, v_last_sent, v_trial_count, v_started_at, v_deadline_at
  from public.profiles
  where lower(trim(email)) = lower(trim(p_email)) and email_verified = false
  limit 1 for update;

  if v_profile_id is null then
    return jsonb_build_object('success', true, 'queued', true);
  end if;

  if v_started_at is null then
    v_started_at := v_now;
    v_deadline_at := v_now + interval '3 minutes';
    v_trial_count := 0;
  end if;
  if v_deadline_at is null then v_deadline_at := v_started_at + interval '3 minutes'; end if;
  if v_now >= v_deadline_at then raise exception 'Your verification window has expired. Please sign up again.'; end if;
  if v_trial_count >= 3 then raise exception 'You have reached the maximum number of verification trials. Please sign up again.'; end if;

  if v_last_sent is not null and v_last_sent > v_now - interval '60 seconds' then
    return jsonb_build_object('success', true, 'queued', true, 'rate_limited', true,
      'trial_count', v_trial_count, 'max_trials', 3, 'deadline_at', v_deadline_at);
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'signup_otp_encryption_key' limit 1;
  if v_key is null or v_key = '' then raise exception 'Signup OTP encryption key is not configured'; end if;

  v_trial_count := v_trial_count + 1;
  v_otp := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_expires := least(v_now + interval '1 minute', v_deadline_at);

  update public.profiles
  set signup_otp_hash = encode(digest(v_otp, 'sha256'), 'hex'),
      signup_otp_encrypted = pgp_sym_encrypt(v_otp, v_key)::text,
      signup_otp_expires_at = v_expires,
      signup_otp_attempts = 0,
      signup_otp_last_sent_at = v_now,
      signup_otp_trial_count = v_trial_count,
      signup_verification_started_at = v_started_at,
      signup_verification_deadline_at = v_deadline_at,
      updated_at = v_now
  where id = v_profile_id;

  return jsonb_build_object('success', true, 'queued', true, 'expires_at', v_expires,
    'trial_count', v_trial_count, 'max_trials', 3, 'deadline_at', v_deadline_at);
end;
$$;


ALTER FUNCTION "public"."issue_signup_otp"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_unit_rent_paid_through"("p_unit_id" "uuid", "p_paid_through_month" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_unit public.property_units%rowtype;
  v_assoc public.renter_unit_associations%rowtype;
  v_month date;
  v_end_month date;
  v_inserted integer := 0;
  v_already_paid integer := 0;
  v_months integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_paid_through_month is null
     or p_paid_through_month <> date_trunc('month', p_paid_through_month)::date then
    raise exception 'p_paid_through_month must be the first day of a month';
  end if;

  select * into v_unit
  from public.property_units
  where id = p_unit_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Unit not found or not owned by the current landlord';
  end if;

  select * into v_assoc
  from public.renter_unit_associations
  where unit_id = p_unit_id
    and landlord_id = auth.uid()
    and status in ('ACTIVE','OCCUPIED')
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'No active renter association exists for this unit';
  end if;

  v_month := date_trunc('month', current_date)::date;
  v_end_month := p_paid_through_month;

  if v_end_month < v_month then
    raise exception 'Paid-through month cannot be earlier than the current month';
  end if;

  v_months := ((extract(year from v_end_month)::integer - extract(year from v_month)::integer) * 12)
              + extract(month from v_end_month)::integer
              - extract(month from v_month)::integer
              + 1;

  -- Manual advance tracking is deliberately capped at one year per operation.
  if v_months > 12 then
    raise exception 'A single manual advance update cannot exceed 12 consecutive months';
  end if;

  -- Never silently overwrite an existing non-paid payment state (for example a
  -- provider payment that is still pending). The landlord must resolve that
  -- payment state first.
  if exists (
    select 1
    from public.rent_payments rp
    where rp.renter_assoc_id = v_assoc.id
      and rp.unit_id = p_unit_id
      and (rp.period_year, rp.period_month) in (
        select extract(year from gs)::integer, extract(month from gs)::integer
        from generate_series(v_month, v_end_month, interval '1 month') gs
      )
      and upper(coalesce(rp.status,'')) not in ('PAID','COMPLETED')
  ) then
    raise exception 'One or more requested rent periods already have a non-paid payment record';
  end if;

  v_month := date_trunc('month', current_date)::date;
  while v_month <= v_end_month loop
    if not exists (
      select 1
      from public.rent_payments rp
      where rp.renter_assoc_id = v_assoc.id
        and rp.unit_id = p_unit_id
        and rp.period_year = extract(year from v_month)::integer
        and rp.period_month = extract(month from v_month)::integer
    ) then
      insert into public.rent_payments (
        renter_assoc_id,
        unit_id,
        landlord_id,
        amount_kes,
        period_year,
        period_month,
        status,
        paid_at,
        payment_provider,
        payment_method
      ) values (
        v_assoc.id,
        p_unit_id,
        auth.uid(),
        v_unit.rent,
        extract(year from v_month)::integer,
        extract(month from v_month)::integer,
        'PAID',
        now(),
        'MANUAL',
        'MANUAL'
      );
      v_inserted := v_inserted + 1;
    else
      v_already_paid := v_already_paid + 1;
    end if;

    v_month := (v_month + interval '1 month')::date;
  end loop;

  update public.property_units
  set rent_paid_in_advance = (p_paid_through_month > date_trunc('month', current_date)::date),
      rent_paid_through_month = p_paid_through_month,
      updated_at = now()
  where id = p_unit_id;

  return jsonb_build_object(
    'unit_id', p_unit_id,
    'paid_through_month', p_paid_through_month,
    'months_marked_paid', v_inserted,
    'months_already_paid', v_already_paid,
    'months_covered', v_months,
    'payment_provider', 'MANUAL',
    'payment_method', 'MANUAL'
  );
end;
$$;


ALTER FUNCTION "public"."mark_unit_rent_paid_through"("p_unit_id" "uuid", "p_paid_through_month" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."moving_day_name"("p_date" "date") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select trim(to_char(p_date, 'Day'));
$$;


ALTER FUNCTION "public"."moving_day_name"("p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_application_decision"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_email text; v_full_name text; v_body text;
BEGIN
IF NEW.landlord_application_status <> OLD.landlord_application_status AND NEW.landlord_application_status IN ('approved', 'rejected') THEN
SELECT email, full_name INTO v_email, v_full_name FROM profiles WHERE id = NEW.id;
IF v_email IS NOT NULL THEN
IF NEW.landlord_application_status = 'approved' THEN
v_body := '<p>Dear <strong>' || COALESCE(v_full_name, 'Applicant') || '</strong>,</p>
<p>Congratulations! Your landlord registration has been <strong>approved</strong>.</p>
<p>You can now post property listings on Saka Krib. Visit your dashboard to create your first listing.</p>';
PERFORM queue_notification_email(v_email, 'Landlord Application Approved - Saka Krib', build_email_html('Landlord Application Approved', v_body), 'landlord_approved');
ELSE
v_body := '<p>Dear <strong>' || COALESCE(v_full_name, 'Applicant') || '</strong>,</p>
<p>Your landlord registration application has been <strong>rejected</strong>.</p>
<p>If you believe this was an error, please contact our support team for assistance.</p>';
PERFORM queue_notification_email(v_email, 'Landlord Application Rejected - Saka Krib', build_email_html('Landlord Application Rejected', v_body), 'landlord_rejected');
END IF;
END IF;
END IF;

IF NEW.mover_application_status <> OLD.mover_application_status AND NEW.mover_application_status IN ('approved', 'rejected') THEN
SELECT email, full_name INTO v_email, v_full_name FROM profiles WHERE id = NEW.id;
IF v_email IS NOT NULL THEN
IF NEW.mover_application_status = 'approved' THEN
v_body := '<p>Dear <strong>' || COALESCE(v_full_name, 'Applicant') || '</strong>,</p>
<p>Congratulations! Your mover registration has been <strong>approved</strong>.</p>
<p>You can now accept moving bookings on Saka Krib. Visit your dashboard to manage your mover profile.</p>';
PERFORM queue_notification_email(v_email, 'Mover Application Approved - Saka Krib', build_email_html('Mover Application Approved', v_body), 'mover_approved');
ELSE
v_body := '<p>Dear <strong>' || COALESCE(v_full_name, 'Applicant') || '</strong>,</p>
<p>Your mover registration application has been <strong>rejected</strong>.</p>
<p>If you believe this was an error, please contact our support team for assistance.</p>';
PERFORM queue_notification_email(v_email, 'Mover Application Rejected - Saka Krib', build_email_html('Mover Application Rejected', v_body), 'mover_rejected');
END IF;
END IF;
END IF;

RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_application_decision"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_listing_approved"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_email text; v_full_name text; v_body text;
BEGIN
IF NEW.approval_status = 'approved' AND OLD.approval_status <> 'approved' THEN
SELECT email, full_name INTO v_email, v_full_name FROM profiles WHERE id = NEW.user_id;
IF v_email IS NULL THEN RETURN NEW; END IF;

v_body := '<p>Dear <strong>' || COALESCE(v_full_name, 'Landlord') || '</strong>,</p>
<p>Great news! Your property listing has been <strong>approved</strong> and is now live on Saka Krib.</p>
<div style="margin:24px 0;padding:20px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;">
<h3 style="margin:0 0 8px;color:#0f172a;font-size:18px;">' || NEW.title || '</h3>
<p style="margin:4px 0;color:#64748b;font-size:14px;">' || NEW.city || ', ' || NEW.county || '</p>
<p style="margin:12px 0 0;padding:8px 12px;background:#dcfce7;border-radius:6px;display:inline-block;color:#166534;font-size:13px;font-weight:600;">
Status: Approved &amp; Live
</p>
</div>
<p>Renters can now discover and contact you about this property.</p>';
PERFORM queue_notification_email(v_email, 'Listing Approved - Saka Krib', build_email_html('Listing Approved', v_body), 'listing_approved');
END IF;
RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_listing_approved"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_listing_posted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_email text; v_full_name text; v_body text;
BEGIN
SELECT email, full_name INTO v_email, v_full_name FROM profiles WHERE id = NEW.user_id;
IF v_email IS NULL THEN RETURN NEW; END IF;

v_body := '<p>Dear <strong>' || COALESCE(v_full_name, 'Landlord') || '</strong>,</p>
<p>Your property listing has been successfully created and is now awaiting administrator approval.</p>
<div style="margin:24px 0;padding:20px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
<h3 style="margin:0 0 8px;color:#0f172a;font-size:18px;">' || NEW.title || '</h3>
<p style="margin:4px 0;color:#64748b;font-size:14px;">' || NEW.city || ', ' || NEW.county || '</p>
<p style="margin:8px 0 0;color:#0f766e;font-size:20px;font-weight:700;">KES ' || to_char(NEW.price_kes, 'FM999,999,999') || '</p>
<p style="margin:4px 0 0;color:#64748b;font-size:13px;">' || CASE WHEN NEW.listing_type = 'rent' THEN 'For Rent' ELSE 'For Sale' END || ' &middot; ' || NEW.beds || ' bed &middot; ' || NEW.baths || ' bath</p>
<p style="margin:12px 0 0;padding:8px 12px;background:#fef3c7;border-radius:6px;display:inline-block;color:#92400e;font-size:13px;font-weight:600;">
Status: Pending Review
</p>
</div>
<p>Once approved by our admin team, your listing will be visible to renters across Kenya. You will receive an email notification when this happens.</p>';
PERFORM queue_notification_email(v_email, 'Listing Posted Successfully - Saka Krib', build_email_html('Listing Posted Successfully', v_body), 'listing_posted');

RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_listing_posted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_moving_dispute"("p_booking_id" "uuid", "p_reason_code" "text", "p_description" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid:=auth.uid(); v_b public.bookings%rowtype; v_mover_user uuid; v_dispute uuid;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if p_reason_code not in ('DAMAGED_BELONGINGS','MISSING_BELONGINGS','DELIVERY_PROBLEM','SERVICE_PROBLEM','PAYMENT_PROBLEM','OTHER') then raise exception 'Invalid dispute reason'; end if;
 if length(btrim(coalesce(p_description,''))) not between 1 and 5000 then raise exception 'Dispute description must be between 1 and 5000 characters'; end if;
 select b.* into v_b from public.bookings b where b.id=p_booking_id and (b.renter_id=v_uid or exists(select 1 from public.movers m where m.id=b.mover_id and m.user_id=v_uid)) for update;
 if not found then raise exception 'Booking not found or unauthorized'; end if;
 if v_b.status not in ('in_progress','completed') then raise exception 'Dispute can only be opened for an active or completed moving job'; end if;
 if v_b.payment_status not in ('paid','held') then raise exception 'No settled payment exists for this booking'; end if;
 if exists(select 1 from public.moving_disputes d where d.booking_id=p_booking_id and d.status='OPEN') then raise exception 'An open dispute already exists for this booking'; end if;
 insert into public.moving_disputes(booking_id,opened_by,reason_code,description) values(p_booking_id,v_uid,p_reason_code,btrim(p_description)) returning id into v_dispute;
 update public.bookings set dispute_status='OPEN',updated_at=now() where id=p_booking_id;
 update public.mover_payouts set final_payment_status='held',updated_at=now() where booking_id=p_booking_id and final_payment_status='processing';
 select m.user_id into v_mover_user from public.movers m where m.id=v_b.mover_id;
 perform public.dispatch_user_notification(case when v_uid=v_b.renter_id then v_mover_user else v_b.renter_id end,'MOVING_DISPUTE_OPENED','Moving dispute opened','A dispute has been opened for this moving booking. Escrow release is paused pending admin review.',jsonb_build_object('booking_id',p_booking_id,'dispute_id',v_dispute), 'moving_dispute_opened:'||v_dispute::text,true,'moving_dispute_opened');
 return jsonb_build_object('dispute_id',v_dispute,'booking_id',p_booking_id,'status','OPEN');
end; $$;


ALTER FUNCTION "public"."open_moving_dispute"("p_booking_id" "uuid", "p_reason_code" "text", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_listing_payment"("p_payment_id" "uuid" DEFAULT NULL::"uuid", "p_checkout_request_id" "text" DEFAULT NULL::"text", "p_paid_amount" numeric DEFAULT NULL::numeric, "p_mpesa_receipt" "text" DEFAULT NULL::"text", "p_merchant_request_id" "text" DEFAULT NULL::"text", "p_phone_number" "text" DEFAULT NULL::"text", "p_result_code" integer DEFAULT NULL::integer, "p_result_description" "text" DEFAULT NULL::"text", "p_provider" "text" DEFAULT 'MPESA'::"text", "p_payment_method" "text" DEFAULT 'MPESA'::"text", "p_provider_reference" "text" DEFAULT NULL::"text", "p_payment_intent_id" "uuid" DEFAULT NULL::"uuid", "p_provider_amount" numeric DEFAULT NULL::numeric, "p_provider_currency" "text" DEFAULT NULL::"text", "p_paypal_order_id" "text" DEFAULT NULL::"text", "p_paypal_fx_rate" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_intent public.listing_payment_intents%ROWTYPE; v_listing public.listings%ROWTYPE; v_payment_id uuid; v_user_id uuid; v_role text; v_data jsonb; v_free_used integer:=0; v_subscription_id uuid:=NULL; v_subscription_limit integer:=NULL; v_subscription_used integer:=0; v_subscription_remaining integer:=NULL; v_has_payment boolean:=false; v_provider_reference text; v_provider text:=upper(coalesce(p_provider,'')); v_method text:=upper(coalesce(p_payment_method,''));
BEGIN
IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'This payment finalizer is server-side only'; END IF;
IF v_provider NOT IN ('MPESA','PAYPAL') OR v_method NOT IN ('MPESA','PAYPAL') OR v_provider<>v_method THEN RAISE EXCEPTION 'Unsupported individual listing payment provider'; END IF;
IF p_payment_intent_id IS NULL THEN RAISE EXCEPTION 'Payment intent is required'; END IF;
IF p_paid_amount IS NULL OR round(p_paid_amount,2)<>1000.00 THEN RAISE EXCEPTION 'Individual listing payment must be exactly KES 1,000'; END IF;
SELECT * INTO v_intent FROM public.listing_payment_intents WHERE id=p_payment_intent_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Listing payment intent not found'; END IF;
IF v_intent.status='PAID' THEN RETURN jsonb_build_object('success',true,'already_processed',true,'payment_intent_id',v_intent.id,'listing_id',v_intent.listing_id,'status','PAID'); END IF;
IF v_intent.status<>'PENDING' THEN RAISE EXCEPTION 'Payment intent is not pending'; END IF;
IF v_intent.expires_at IS NOT NULL AND v_intent.expires_at<=now() THEN UPDATE public.listing_payment_intents SET status='EXPIRED',updated_at=now() WHERE id=v_intent.id AND status='PENDING'; RAISE EXCEPTION 'Payment intent has expired'; END IF;
IF round(v_intent.amount_kes,2)<>round(p_paid_amount,2) THEN RAISE EXCEPTION 'Payment amount does not match payment intent'; END IF;
IF v_provider='MPESA' THEN v_provider_reference:=NULLIF(trim(coalesce(p_provider_reference,p_checkout_request_id,'')),''); IF NULLIF(trim(coalesce(p_mpesa_receipt,'')),'') IS NULL OR v_provider_reference IS NULL THEN RAISE EXCEPTION 'Valid M-Pesa receipt and provider reference are required'; END IF;
ELSE v_provider_reference:=NULLIF(trim(coalesce(p_paypal_order_id,p_provider_reference,'')),''); IF v_provider_reference IS NULL OR p_provider_amount IS NULL OR p_provider_amount<=0 OR upper(coalesce(p_provider_currency,''))<>'USD' THEN RAISE EXCEPTION 'Valid PayPal order, USD amount and currency are required'; END IF; IF v_intent.paypal_order_id IS NOT NULL AND v_intent.paypal_order_id<>p_paypal_order_id THEN RAISE EXCEPTION 'PayPal order does not match payment intent'; END IF; IF v_intent.provider_amount IS NOT NULL AND round(v_intent.provider_amount,2)<>round(p_provider_amount,2) THEN RAISE EXCEPTION 'PayPal amount does not match payment intent'; END IF; END IF;
v_user_id:=v_intent.user_id; v_role:=lower(v_intent.role); v_data:=v_intent.listing_data; IF v_role NOT IN ('landlord','real_estate') THEN RAISE EXCEPTION 'Unsupported listing payment role'; END IF;
SELECT coalesce(free_listings_used,0) INTO v_free_used FROM public.profiles WHERE id=v_user_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
IF v_role='landlord' THEN SELECT s.subscription_id,s.max_listings INTO v_subscription_id,v_subscription_limit FROM public.get_current_landlord_subscription(v_user_id) s; ELSE SELECT s.subscription_id,s.max_listings INTO v_subscription_id,v_subscription_limit FROM public.get_current_real_estate_subscription(v_user_id) s; END IF;
IF v_subscription_id IS NOT NULL THEN IF v_role='landlord' THEN SELECT count(*)::integer INTO v_subscription_used FROM public.subscription_listings sl JOIN public.listings l ON l.id=sl.listing_id WHERE sl.subscription_id=v_subscription_id AND sl.status='ACTIVE' AND l.user_id=v_user_id; ELSE SELECT count(*)::integer INTO v_subscription_used FROM public.subscription_listings sl JOIN public.listings l ON l.id=sl.listing_id WHERE sl.real_estate_subscription_id=v_subscription_id AND sl.status='ACTIVE' AND l.user_id=v_user_id; END IF; IF v_subscription_limit IS NOT NULL THEN v_subscription_remaining:=greatest(v_subscription_limit-v_subscription_used,0); END IF; END IF;
IF v_free_used>=3 AND v_subscription_id IS NULL THEN v_has_payment:=true; ELSIF v_free_used>=3 AND v_subscription_id IS NOT NULL AND (v_subscription_limit IS NULL OR v_subscription_remaining<=0) THEN v_has_payment:=true; END IF; IF NOT v_has_payment THEN RAISE EXCEPTION 'An existing free or subscription listing entitlement is available; individual payment is not required'; END IF;
IF coalesce((v_data->>'is_property_management')::boolean,false) AND v_role<>'landlord' THEN RAISE EXCEPTION 'Property management listings are restricted to landlords'; END IF; IF coalesce((v_data->>'is_property_management')::boolean,false) AND v_subscription_id IS NULL THEN RAISE EXCEPTION 'PMS subscription required for property management listings'; END IF;
INSERT INTO public.listings (user_id,title,description,city,county,location_search,latitude,longitude,property_name,property_type,price_kes,listing_type,deposit_required,deposit_structure,deposit_amount,size,beds,baths,contact_phone,contact_email,social_links,booking_enabled,payment_enabled,is_property_management,is_paid,is_published,approval_status,is_approved,status) VALUES (v_user_id,coalesce(v_data->>'title',''),coalesce(v_data->>'description',''),coalesce(v_data->>'city',''),coalesce(v_data->>'county',''),v_data->>'location_search',NULLIF(v_data->>'latitude','')::double precision,NULLIF(v_data->>'longitude','')::double precision,v_data->>'property_name',v_data->>'property_type',NULLIF(v_data->>'price_kes','')::numeric,coalesce(v_data->>'listing_type','rent'),coalesce((v_data->>'deposit_required')::boolean,false),v_data->>'deposit_structure',coalesce(NULLIF(v_data->>'deposit_amount','')::numeric,0),v_data->>'size',coalesce(NULLIF(v_data->>'beds','')::integer,0),coalesce(NULLIF(v_data->>'baths','')::integer,0),v_data->>'contact_phone',v_data->>'contact_email',coalesce(v_data->'social_links','[]'::jsonb),coalesce((v_data->>'booking_enabled')::boolean,false),coalesce((v_data->>'payment_enabled')::boolean,false),coalesce((v_data->>'is_property_management')::boolean,false),true,false,'pending_review',false,'pending') RETURNING * INTO v_listing;
INSERT INTO public.listing_payments (id,listing_id,user_id,amount_kes,status,payment_provider,payment_method,checkout_request_id,mpesa_receipt,merchant_request_id,phone_number,result_code,result_description,paid_at,provider_reference,provider_amount,provider_currency,paypal_order_id,paypal_fx_rate) VALUES (coalesce(p_payment_id,gen_random_uuid()),v_listing.id,v_user_id,v_intent.amount_kes,'PAID',v_provider,v_method,NULLIF(p_checkout_request_id,''),NULLIF(p_mpesa_receipt,''),NULLIF(p_merchant_request_id,''),NULLIF(p_phone_number,''),p_result_code,p_result_description,now(),v_provider_reference,p_provider_amount,upper(nullif(p_provider_currency,'')),NULLIF(p_paypal_order_id,''),p_paypal_fx_rate) RETURNING id INTO v_payment_id;
UPDATE public.listing_payment_intents SET status='PAID',provider=v_provider,provider_reference=v_provider_reference,provider_amount=p_provider_amount,provider_currency=upper(nullif(p_provider_currency,'')),paypal_order_id=nullif(p_paypal_order_id,''),paypal_fx_rate=p_paypal_fx_rate,listing_id=v_listing.id,paid_at=now(),updated_at=now() WHERE id=v_intent.id AND status='PENDING';
RETURN jsonb_build_object('success',true,'already_processed',false,'payment_intent_id',v_intent.id,'payment_id',v_payment_id,'listing_id',v_listing.id,'status','PAID','listing_is_paid',true,'listing_is_published',false,'listing_approval_status','pending_review');
END;$$;


ALTER FUNCTION "public"."process_listing_payment"("p_payment_id" "uuid", "p_checkout_request_id" "text", "p_paid_amount" numeric, "p_mpesa_receipt" "text", "p_merchant_request_id" "text", "p_phone_number" "text", "p_result_code" integer, "p_result_description" "text", "p_provider" "text", "p_payment_method" "text", "p_provider_reference" "text", "p_payment_intent_id" "uuid", "p_provider_amount" numeric, "p_provider_currency" "text", "p_paypal_order_id" "text", "p_paypal_fx_rate" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_pms_growth_notifications"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_subscription record;
    v_plan record;
    v_unit_count integer;
    v_created integer := 0;
    v_notification_type text;
    v_title text;
    v_message text;
    v_action_type text;
    v_action_required boolean;
begin
    for v_subscription in
        select ls.id, ls.landlord_id, ls.plan_id, ls.status
        from public.landlord_subscriptions ls
        where ls.status in ('ACTIVE','GRACE_PERIOD')
    loop
        select sp.name, sp.max_listings
        into v_plan
        from public.subscription_plans sp
        where sp.id = v_subscription.plan_id;

        if v_plan is null then
            continue;
        end if;

        select count(*)
        into v_unit_count
        from public.subscription_listings sl
        where sl.subscription_id = v_subscription.id
          and sl.status = 'ACTIVE';

        if v_plan.name = 'STARTER' then
            if v_unit_count >= 5 then
                v_notification_type := 'GROWTH_5';
                v_title := 'Congratulations on your PMS growth!';
                v_message := 'You are now managing 5 PMS units. Your property portfolio is growing consistently. You are approaching the Growth plan limit, so consider upgrading when you are ready.';
                v_action_type := 'VIEW_SUBSCRIPTION';
                v_action_required := false;
                insert into public.pms_subscription_notifications
                    (landlord_id, subscription_id, notification_type, unit_count, title, message, action_type, action_required)
                values
                    (v_subscription.landlord_id, v_subscription.id, v_notification_type, v_unit_count, v_title, v_message, v_action_type, v_action_required)
                on conflict do nothing;
                if found then v_created := v_created + 1; end if;
            end if;

            if v_unit_count >= 15 then
                insert into public.pms_subscription_notifications
                    (landlord_id, subscription_id, notification_type, unit_count, title, message, action_type, action_required)
                values
                    (v_subscription.landlord_id, v_subscription.id, 'GROWTH_15', v_unit_count,
                     'You are growing fast!',
                     'You are now managing 15 PMS units. Your portfolio is showing strong growth. You can continue managing your current units, and you can upgrade your PMS subscription whenever you are ready.',
                     'VIEW_SUBSCRIPTION', false)
                on conflict do nothing;
                if found then v_created := v_created + 1; end if;
            end if;

            if v_unit_count >= 17 then
                insert into public.pms_subscription_notifications
                    (landlord_id, subscription_id, notification_type, unit_count, title, message, action_type, action_required)
                values
                    (v_subscription.landlord_id, v_subscription.id, 'GROWTH_17', v_unit_count,
                     'You are approaching your PMS capacity',
                     'You are now managing 17 PMS units. You are getting close to the 20-unit Growth capacity. Consider upgrading before you reach the limit.',
                     'UPGRADE', true)
                on conflict do nothing;
                if found then v_created := v_created + 1; end if;
            end if;

            if v_unit_count >= 19 then
                insert into public.pms_subscription_notifications
                    (landlord_id, subscription_id, notification_type, unit_count, title, message, action_type, action_required)
                values
                    (v_subscription.landlord_id, v_subscription.id, 'GROWTH_19', v_unit_count,
                     'One PMS unit away from your Growth limit',
                     'You are now managing 19 PMS units. You have one remaining unit within your current Growth capacity. You can upgrade to Pro when you are ready.',
                     'UPGRADE', true)
                on conflict do nothing;
                if found then v_created := v_created + 1; end if;
            end if;

            if v_unit_count >= 20 then
                insert into public.pms_subscription_notifications
                    (landlord_id, subscription_id, notification_type, unit_count, title, message, action_type, action_required)
                values
                    (v_subscription.landlord_id, v_subscription.id, 'GROWTH_LIMIT', v_unit_count,
                     'Congratulations on your growth!',
                     'Congratulations! You have reached 20 PMS units. Your consistency and growth are impressive. You can upgrade to Pro to continue expanding your PMS-managed portfolio.',
                     'UPGRADE', true)
                on conflict do nothing;
                if found then v_created := v_created + 1; end if;
            end if;
        end if;

        if v_plan.name = 'GROWTH' then
            if v_unit_count >= 35 then
                insert into public.pms_subscription_notifications
                    (landlord_id, subscription_id, notification_type, unit_count, title, message, action_type, action_required)
                values
                    (v_subscription.landlord_id, v_subscription.id, 'PROGRESS_35', v_unit_count,
                     'Your PMS portfolio is growing strongly',
                     'You are now managing 35 PMS units. Your property management operation is expanding significantly. Keep up the consistency!',
                     'VIEW_SUBSCRIPTION', false)
                on conflict do nothing;
                if found then v_created := v_created + 1; end if;
            end if;

            if v_unit_count >= 38 then
                insert into public.pms_subscription_notifications
                    (landlord_id, subscription_id, notification_type, unit_count, title, message, action_type, action_required)
                values
                    (v_subscription.landlord_id, v_subscription.id, 'PROGRESS_38', v_unit_count,
                     'You are approaching your next PMS milestone',
                     'You are now managing 38 PMS units. Your portfolio continues to grow. Consider Pro when you need additional PMS capacity.',
                     'UPGRADE', true)
                on conflict do nothing;
                if found then v_created := v_created + 1; end if;
            end if;

            if v_unit_count >= 39 then
                insert into public.pms_subscription_notifications
                    (landlord_id, subscription_id, notification_type, unit_count, title, message, action_type, action_required)
                values
                    (v_subscription.landlord_id, v_subscription.id, 'PROGRESS_39', v_unit_count,
                     'You are almost at your next PMS milestone',
                     'You are now managing 39 PMS units. Pro provides unlimited PMS-managed units when you are ready to expand further.',
                     'UPGRADE', true)
                on conflict do nothing;
                if found then v_created := v_created + 1; end if;
            end if;

            if v_unit_count >= 40 then
                insert into public.pms_subscription_notifications
                    (landlord_id, subscription_id, notification_type, unit_count, title, message, action_type, action_required)
                values
                    (v_subscription.landlord_id, v_subscription.id, 'GROWTH_TO_PRO', v_unit_count,
                     'Congratulations on reaching 40 PMS units!',
                     'Congratulations! Your PMS portfolio has reached 40 units. Your continued growth and consistency are impressive. Upgrade to Pro for unlimited PMS-managed units.',
                     'UPGRADE', true)
                on conflict do nothing;
                if found then v_created := v_created + 1; end if;
            end if;
        end if;

        if v_plan.name = 'PRO' and v_unit_count > 0 then
            null;
        end if;
    end loop;

    return jsonb_build_object(
        'success', true,
        'notifications_created', v_created,
        'processed_at', now()
    );
end;
$$;


ALTER FUNCTION "public"."process_pms_growth_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_real_estate_subscription_payment"("p_invoice_id" "uuid", "p_checkout_request_id" "text", "p_mpesa_receipt" "text", "p_merchant_request_id" "text" DEFAULT NULL::"text", "p_phone_number" "text" DEFAULT NULL::"text", "p_result_code" integer DEFAULT 0, "p_result_description" "text" DEFAULT NULL::"text", "p_paid_amount" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_invoice public.subscription_invoices%rowtype; v_subscription public.real_estate_subscriptions%rowtype; v_now timestamptz:=now(); v_base_date timestamptz; v_new_period_end timestamptz;
begin
 if auth.uid() is not null then raise exception 'This payment finalizer is server-side only'; end if;
 if p_invoice_id is null or p_checkout_request_id is null or trim(p_checkout_request_id)='' then raise exception 'Invoice ID and CheckoutRequestID are required'; end if;
 select * into v_invoice from public.subscription_invoices where id=p_invoice_id and real_estate_subscription_id is not null for update;
 if not found then raise exception 'Real Estate subscription invoice not found'; end if;
 if v_invoice.status='PAID' then return jsonb_build_object('success',true,'already_processed',true,'invoice_id',v_invoice.id,'subscription_id',v_invoice.real_estate_subscription_id,'status','PAID'); end if;
 if v_invoice.status<>'PENDING' then raise exception 'Invoice is not pending. Current status: %',v_invoice.status; end if;
 if p_result_code<>0 then update public.subscription_invoices set status='FAILED',merchant_request_id=p_merchant_request_id,result_code=p_result_code,result_description=coalesce(p_result_description,'M-Pesa payment failed'),phone_number=coalesce(p_phone_number,phone_number) where id=v_invoice.id; return jsonb_build_object('success',true,'status','FAILED','invoice_id',v_invoice.id); end if;
 if p_mpesa_receipt is null or trim(p_mpesa_receipt)='' then raise exception 'Successful M-Pesa payment is missing receipt number'; end if;
 if p_paid_amount is null or round(p_paid_amount,2)<>round(v_invoice.amount_kes,2) then update public.subscription_invoices set status='FAILED',result_description='M-Pesa payment amount does not match invoice amount' where id=v_invoice.id; raise exception 'M-Pesa amount mismatch'; end if;
 select * into v_subscription from public.real_estate_subscriptions where id=v_invoice.real_estate_subscription_id for update;
 if not found then raise exception 'Real Estate subscription not found'; end if;
 v_base_date:=case when v_subscription.current_period_end is not null and v_subscription.current_period_end>v_now then v_subscription.current_period_end else v_now end;
 v_new_period_end:=case when v_subscription.billing_cycle='MONTHLY' then v_base_date+interval '30 days' when v_subscription.billing_cycle='ANNUAL' then v_base_date+interval '365 days' else null end;
 if v_new_period_end is null then raise exception 'Invalid billing cycle: %',v_subscription.billing_cycle; end if;
 update public.subscription_invoices set status='PAID',mpesa_receipt=p_mpesa_receipt,checkout_request_id=p_checkout_request_id,merchant_request_id=p_merchant_request_id,phone_number=coalesce(p_phone_number,phone_number),result_code=0,result_description=coalesce(p_result_description,'Payment successful'),paid_at=v_now,payment_provider='MPESA',payment_method='MPESA' where id=v_invoice.id and status='PENDING';
 update public.real_estate_subscriptions set status='ACTIVE',current_period_start=v_now,current_period_end=v_new_period_end,grace_period_end=null,updated_at=v_now where id=v_subscription.id;
 return jsonb_build_object('success',true,'already_processed',false,'invoice_id',v_invoice.id,'subscription_id',v_subscription.id,'status','ACTIVE','amount_kes',v_invoice.amount_kes,'current_period_end',v_new_period_end);
end; $$;


ALTER FUNCTION "public"."process_real_estate_subscription_payment"("p_invoice_id" "uuid", "p_checkout_request_id" "text", "p_mpesa_receipt" "text", "p_merchant_request_id" "text", "p_phone_number" "text", "p_result_code" integer, "p_result_description" "text", "p_paid_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_rent_payment"("p_payment_intent_id" "uuid", "p_provider" "text", "p_payment_method" "text", "p_paid_amount" numeric, "p_provider_reference" "text", "p_provider_amount" numeric DEFAULT NULL::numeric, "p_provider_currency" "text" DEFAULT NULL::"text", "p_mpesa_receipt" "text" DEFAULT NULL::"text", "p_checkout_request_id" "text" DEFAULT NULL::"text", "p_merchant_request_id" "text" DEFAULT NULL::"text", "p_phone_number" "text" DEFAULT NULL::"text", "p_result_code" integer DEFAULT NULL::integer, "p_result_description" "text" DEFAULT NULL::"text", "p_paypal_order_id" "text" DEFAULT NULL::"text", "p_paypal_fx_rate" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_intent record;
  v_period record;
  v_existing_id uuid;
  v_rent numeric(12,2);
  v_total numeric(12,2) := 0;
  v_payment_ids jsonb := '[]'::jsonb;
  v_role text := current_setting('request.jwt.claim.role', true);
begin
  if v_role <> 'service_role' then raise exception 'Service role required'; end if;
  if p_provider not in ('MPESA','PAYPAL') then raise exception 'Unsupported rent payment provider'; end if;
  if p_payment_method <> p_provider then raise exception 'Provider and payment method must match'; end if;
  if p_paid_amount is null or p_paid_amount <= 0 then raise exception 'Invalid paid amount'; end if;

  select * into v_intent from rent_payment_intents where id = p_payment_intent_id for update;
  if not found then raise exception 'Rent payment intent not found'; end if;
  if v_intent.status = 'PAID' then
    return jsonb_build_object('success',true,'idempotent',true,'payment_intent_id',v_intent.id,'amount_kes',v_intent.amount_kes,'payment_periods',v_intent.payment_periods);
  end if;
  if v_intent.status not in ('PENDING','PROCESSING') then raise exception 'Payment intent is not payable: %', v_intent.status; end if;
  if v_intent.expires_at <= now() then update rent_payment_intents set status='EXPIRED',updated_at=now() where id=v_intent.id; raise exception 'Payment intent has expired'; end if;
  if round(p_paid_amount::numeric,2) <> round(v_intent.amount_kes::numeric,2) then raise exception 'Paid amount does not match authoritative rent amount'; end if;
  if p_provider='PAYPAL' and (p_provider_currency <> 'USD' or p_provider_amount is null or p_paypal_order_id is null) then raise exception 'PayPal payment requires USD amount and PayPal order ID'; end if;
  if p_provider='MPESA' and p_provider_currency is not null and p_provider_currency <> 'KES' then raise exception 'M-Pesa provider currency must be KES'; end if;

  select pu.rent into v_rent from property_units pu where pu.id=v_intent.unit_id and pu.user_id=v_intent.landlord_id and pu.payment_tracking_enabled=true;
  if not found then raise exception 'Authoritative unit/rent configuration not found'; end if;
  if round(v_rent * jsonb_array_length(v_intent.payment_periods),2) <> round(v_intent.amount_kes,2) then raise exception 'Unit rent changed since payment intent creation'; end if;

  update rent_payment_intents set status='PROCESSING',provider=p_provider,payment_method=p_payment_method,provider_reference=p_provider_reference,provider_amount=p_provider_amount,provider_currency=p_provider_currency,mpesa_receipt=p_mpesa_receipt,checkout_request_id=p_checkout_request_id,merchant_request_id=p_merchant_request_id,phone_number=p_phone_number,result_code=p_result_code,result_description=p_result_description,paypal_order_id=p_paypal_order_id,paypal_fx_rate=p_paypal_fx_rate,updated_at=now() where id=v_intent.id;

  for v_period in select * from jsonb_to_recordset(v_intent.payment_periods) as x(period_year int, period_month int) loop
    if exists (select 1 from rent_payments rp where rp.renter_assoc_id=v_intent.renter_assoc_id and rp.unit_id=v_intent.unit_id and rp.period_year=v_period.period_year and rp.period_month=v_period.period_month and rp.status='PAID') then
      raise exception 'Payment period %-% is already paid',v_period.period_year,v_period.period_month;
    end if;
    v_existing_id := null;
    select rp.id into v_existing_id from rent_payments rp where rp.renter_assoc_id=v_intent.renter_assoc_id and rp.unit_id=v_intent.unit_id and rp.period_year=v_period.period_year and rp.period_month=v_period.period_month for update;
    if v_existing_id is null then
      insert into rent_payments(renter_assoc_id,unit_id,landlord_id,amount_kes,period_year,period_month,status,mpesa_receipt,checkout_request_id,paid_at,payment_provider,payment_method,created_at,updated_at,payment_intent_id,provider_reference,provider_amount,provider_currency,paypal_order_id,paypal_fx_rate,merchant_request_id,phone_number,result_code,result_description)
      values(v_intent.renter_assoc_id,v_intent.unit_id,v_intent.landlord_id,v_rent,v_period.period_year,v_period.period_month,'PAID',p_mpesa_receipt,p_checkout_request_id,now(),p_provider,p_payment_method,now(),now(),v_intent.id,p_provider_reference,p_provider_amount,p_provider_currency,p_paypal_order_id,p_paypal_fx_rate,p_merchant_request_id,p_phone_number,p_result_code,p_result_description)
      returning id into v_existing_id;
    else
      update rent_payments set amount_kes=v_rent,status='PAID',paid_at=now(),payment_provider=p_provider,payment_method=p_payment_method,payment_intent_id=v_intent.id,provider_reference=p_provider_reference,provider_amount=p_provider_amount,provider_currency=p_provider_currency,mpesa_receipt=p_mpesa_receipt,checkout_request_id=p_checkout_request_id,merchant_request_id=p_merchant_request_id,phone_number=p_phone_number,result_code=p_result_code,result_description=p_result_description,paypal_order_id=p_paypal_order_id,paypal_fx_rate=p_paypal_fx_rate,updated_at=now() where id=v_existing_id;
    end if;
    v_payment_ids := v_payment_ids || jsonb_build_array(v_existing_id);
  end loop;

  update rent_payment_intents set status='PAID',paid_at=now(),updated_at=now() where id=v_intent.id;
  return jsonb_build_object('success',true,'idempotent',false,'payment_intent_id',v_intent.id,'amount_kes',v_intent.amount_kes,'payment_periods',v_intent.payment_periods,'payment_ids',v_payment_ids);
exception when others then
  update rent_payment_intents set status='PENDING',updated_at=now(),result_description=coalesce(sqlerrm,p_result_description) where id=p_payment_intent_id and status='PROCESSING';
  raise;
end;
$$;


ALTER FUNCTION "public"."process_rent_payment"("p_payment_intent_id" "uuid", "p_provider" "text", "p_payment_method" "text", "p_paid_amount" numeric, "p_provider_reference" "text", "p_provider_amount" numeric, "p_provider_currency" "text", "p_mpesa_receipt" "text", "p_checkout_request_id" "text", "p_merchant_request_id" "text", "p_phone_number" "text", "p_result_code" integer, "p_result_description" "text", "p_paypal_order_id" "text", "p_paypal_fx_rate" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_subscription_expiry"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_now timestamptz := now();

    v_grace_started integer := 0;
    v_expired integer := 0;
    v_units_deactivated integer := 0;
begin

    /*
     * ========================================================
     * 1. ACTIVE → GRACE_PERIOD
     * ========================================================
     *
     * A subscription enters grace when its paid period ends.
     *
     * We do NOT expire it immediately.
     *
     * Grace period = 5 days.
     */

    with subscriptions_to_grace as (
        update public.landlord_subscriptions
        set
            status = 'GRACE_PERIOD',
            grace_period_end =
                current_period_end + interval '5 days',
            updated_at = v_now
        where
            status = 'ACTIVE'
            and current_period_end <= v_now
            and (
                grace_period_end is null
                or grace_period_end <= current_period_end
            )
        returning id
    )
    select count(*)
    into v_grace_started
    from subscriptions_to_grace;


    /*
     * ========================================================
     * 2. GRACE_PERIOD → EXPIRED
     * ========================================================
     *
     * Once the five-day grace period has ended,
     * the PMS subscription expires.
     */

    with subscriptions_to_expire as (
        update public.landlord_subscriptions
        set
            status = 'EXPIRED',
            grace_period_end = null,
            updated_at = v_now
        where
            status = 'GRACE_PERIOD'
            and grace_period_end is not null
            and grace_period_end <= v_now
        returning id
    )
    select count(*)
    into v_expired
    from subscriptions_to_expire;


    /*
     * ========================================================
     * 3. DEACTIVATE PMS UNITS
     * ========================================================
     *
     * IMPORTANT:
     *
     * We are NOT deleting listings.
     *
     * We are only removing PMS management access from the
     * units belonging to expired subscriptions.
     */

    update public.subscription_listings sl
    set
        status = 'INACTIVE',
        deactivated_at = v_now
    where
        sl.status = 'ACTIVE'
        and exists (
            select 1
            from public.landlord_subscriptions ls
            where
                ls.id = sl.subscription_id
                and ls.status = 'EXPIRED'
        );

    get diagnostics
        v_units_deactivated = row_count;


    /*
     * ========================================================
     * 4. RETURN PROCESSING SUMMARY
     * ========================================================
     */

    return jsonb_build_object(
        'success', true,
        'processed_at', v_now,
        'subscriptions_moved_to_grace',
            v_grace_started,
        'subscriptions_expired',
            v_expired,
        'pms_units_deactivated',
            v_units_deactivated
    );

end;
$$;


ALTER FUNCTION "public"."process_subscription_expiry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_subscription_payment"("p_invoice_id" "uuid", "p_checkout_request_id" "text", "p_mpesa_receipt" "text", "p_merchant_request_id" "text" DEFAULT NULL::"text", "p_phone_number" "text" DEFAULT NULL::"text", "p_result_code" integer DEFAULT 0, "p_result_description" "text" DEFAULT NULL::"text", "p_paid_amount" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_invoice public.subscription_invoices%rowtype; v_subscription public.landlord_subscriptions%rowtype; v_now timestamptz:=now(); v_base_date timestamptz; v_new_period_end timestamptz;
begin
 if p_invoice_id is null or p_checkout_request_id is null or trim(p_checkout_request_id)='' then raise exception 'Invoice ID and CheckoutRequestID are required'; end if;
 select * into v_invoice from public.subscription_invoices where id=p_invoice_id and landlord_subscription_id is not null for update;
 if not found then raise exception 'Landlord subscription invoice not found'; end if;
 if v_invoice.status='PAID' then return jsonb_build_object('success',true,'already_processed',true,'invoice_id',v_invoice.id,'subscription_id',v_invoice.landlord_subscription_id,'status','PAID'); end if;
 if v_invoice.status<>'PENDING' then raise exception 'Invoice is not pending. Current status: %',v_invoice.status; end if;
 if v_invoice.checkout_request_id is not null and v_invoice.checkout_request_id<>p_checkout_request_id then raise exception 'CheckoutRequestID does not match invoice'; end if;
 if p_result_code<>0 then update public.subscription_invoices set status='FAILED',merchant_request_id=p_merchant_request_id,result_code=p_result_code,result_description=coalesce(p_result_description,'M-Pesa payment failed'),phone_number=coalesce(p_phone_number,phone_number) where id=v_invoice.id; return jsonb_build_object('success',true,'status','FAILED','invoice_id',v_invoice.id); end if;
 if p_mpesa_receipt is null or trim(p_mpesa_receipt)='' then raise exception 'Successful M-Pesa payment is missing receipt number'; end if;
 if p_paid_amount is null or round(p_paid_amount,2)<>round(v_invoice.amount_kes,2) then update public.subscription_invoices set status='FAILED',result_description='M-Pesa payment amount does not match invoice amount' where id=v_invoice.id; raise exception 'M-Pesa amount mismatch'; end if;
 select * into v_subscription from public.landlord_subscriptions where id=v_invoice.landlord_subscription_id for update;
 if not found then raise exception 'Landlord subscription not found'; end if;
 v_base_date:=case when v_subscription.current_period_end is not null and v_subscription.current_period_end>v_now then v_subscription.current_period_end else v_now end;
 v_new_period_end:=case when v_subscription.billing_cycle='MONTHLY' then v_base_date+interval '30 days' when v_subscription.billing_cycle='ANNUAL' then v_base_date+interval '365 days' else null end;
 if v_new_period_end is null then raise exception 'Invalid billing cycle: %',v_subscription.billing_cycle; end if;
 update public.subscription_invoices set status='PAID',mpesa_receipt=p_mpesa_receipt,checkout_request_id=p_checkout_request_id,merchant_request_id=p_merchant_request_id,phone_number=coalesce(p_phone_number,phone_number),result_code=0,result_description=coalesce(p_result_description,'Payment successful'),paid_at=v_now,payment_provider='MPESA',payment_method='MPESA' where id=v_invoice.id and status='PENDING';
 update public.landlord_subscriptions set status='ACTIVE',current_period_start=v_now,current_period_end=v_new_period_end,grace_period_end=null,updated_at=v_now where id=v_subscription.id;
 return jsonb_build_object('success',true,'already_processed',false,'invoice_id',v_invoice.id,'subscription_id',v_subscription.id,'status','ACTIVE','amount_kes',v_invoice.amount_kes,'current_period_end',v_new_period_end);
end;
$$;


ALTER FUNCTION "public"."process_subscription_payment"("p_invoice_id" "uuid", "p_checkout_request_id" "text", "p_mpesa_receipt" "text", "p_merchant_request_id" "text", "p_phone_number" "text", "p_result_code" integer, "p_result_description" "text", "p_paid_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."propose_moving_schedule"("p_booking_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_b public.bookings%rowtype;
  v_m public.movers%rowtype;
  v_day text;
  v_start_time time;
  v_end_time time;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_ends_at <= p_starts_at then raise exception 'End time must be after start time'; end if;
  if p_starts_at <= now() then raise exception 'Moving time must be in the future'; end if;

  select b.* into v_b
  from public.bookings b
  where b.id=p_booking_id and b.renter_id=v_uid
  for update;

  if not found then raise exception 'Booking not found or unauthorized'; end if;
  if v_b.status <> 'confirmed' then raise exception 'Mover must confirm before scheduling'; end if;
  if v_b.scheduled_start_at is not null or v_b.scheduled_end_at is not null then
    raise exception 'A moving schedule is already confirmed';
  end if;

  select * into v_m from public.movers where id=v_b.mover_id for update;
  if not found then raise exception 'Mover not found'; end if;

  v_day := lower(public.moving_day_name(p_starts_at at time zone 'Africa/Nairobi'));
  v_start_time := (p_starts_at at time zone 'Africa/Nairobi')::time;
  v_end_time := (p_ends_at at time zone 'Africa/Nairobi')::time;

  if v_m.working_days is not null and not exists(
    select 1 from unnest(v_m.working_days) d where lower(trim(d))=v_day
  ) then
    raise exception 'Mover does not work on %',v_day;
  end if;

  if v_m.start_time is not null and v_start_time < v_m.start_time then
    raise exception 'Start time is outside mover working hours';
  end if;
  if v_m.end_time is not null and v_end_time > v_m.end_time then
    raise exception 'End time is outside mover working hours';
  end if;

  if exists(
    select 1 from public.mover_schedule_events e
    where e.mover_id=v_b.mover_id
      and e.booking_id<>p_booking_id
      and e.status in ('TENTATIVE','CONFIRMED')
      and tstzrange(e.starts_at,e.ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)')
  ) then
    raise exception 'Mover already has another scheduled job at that time';
  end if;

  insert into public.mover_schedule_events(
    mover_id,booking_id,starts_at,ends_at,status,title
  ) values(
    v_b.mover_id,p_booking_id,p_starts_at,p_ends_at,'TENTATIVE','Moving service'
  )
  on conflict (booking_id) do update set
    starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,
    status='TENTATIVE',
    updated_at=now();

  return jsonb_build_object(
    'booking_id',p_booking_id,
    'starts_at',p_starts_at,
    'ends_at',p_ends_at,
    'status','TENTATIVE'
  );
end;
$$;


ALTER FUNCTION "public"."propose_moving_schedule"("p_booking_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_listing_admin_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_is_admin boolean;
begin
  v_is_admin := exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.approval_status := 'pending_review';
    new.is_approved := false;
    new.is_published := false;
    new.admin_reviewed_at := null;
    new.admin_review_note := '';
    return new;
  end if;
  if tg_op = 'UPDATE' and not v_is_admin then
    if new.status is distinct from old.status
       or new.approval_status is distinct from old.approval_status
       or new.is_approved is distinct from old.is_approved
       or new.is_published is distinct from old.is_published
       or new.is_paid is distinct from old.is_paid
       or new.admin_reviewed_at is distinct from old.admin_reviewed_at
       or new.admin_review_note is distinct from old.admin_review_note then
      raise exception 'Only administrators can modify listing workflow, payment, or publication status';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_listing_admin_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_listing_payment_creation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN

    NEW.status := 'PENDING';
    NEW.paid_at := NULL;
    NEW.mpesa_receipt := NULL;
    NEW.result_code := NULL;
    NEW.result_description := NULL;

    RETURN NEW;

END;
$$;


ALTER FUNCTION "public"."protect_listing_payment_creation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_mover_admin_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  v_is_admin := EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  );

  IF current_user <> 'postgres'
     AND NOT v_is_admin
     AND NEW.approval_status IS DISTINCT FROM OLD.approval_status
     AND COALESCE(current_setting('app.mover_status_sync', true), 'false') <> 'true' THEN
    RAISE EXCEPTION 'Only an administrator can change mover approval status';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Mover profile identity and ownership cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_mover_admin_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_mover_application_admin_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  v_is_admin := EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );

  -- These fields are controlled only by the administrator/review workflow.
  IF NOT v_is_admin THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_notes IS DISTINCT FROM OLD.review_notes THEN
      RAISE EXCEPTION 'Only an administrator can change mover application review fields';
    END IF;
  END IF;

  -- These are immutable audit/ownership fields after submission.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.applicant_id IS DISTINCT FROM OLD.applicant_id
     OR NEW.application_type IS DISTINCT FROM OLD.application_type
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Mover application identity and submission audit fields cannot be changed';
  END IF;

  -- updated_at is system-managed rather than user/admin editable.
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_mover_application_admin_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_kyc_verification_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_is_admin boolean;
  v_verification_workflow boolean :=
    COALESCE(current_setting('app.verification_workflow', true), 'false') = 'true';
BEGIN
  -- Supabase SQL Editor / trusted database administrator operations.
  -- This does not grant any privilege to anon/authenticated clients.
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  v_is_admin := EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );

  IF v_is_admin OR v_verification_workflow THEN
    RETURN NEW;
  END IF;

  IF OLD.kyc_completed = true
     AND NEW.kyc_completed IS DISTINCT FROM OLD.kyc_completed THEN
    RAISE EXCEPTION 'KYC completion cannot be revoked by the account owner';
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    RAISE EXCEPTION 'Only the verification workflow can change verification_status';
  END IF;

  IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
    RAISE EXCEPTION 'Email verification is controlled by the authentication system';
  END IF;

  IF NEW.free_listings_used IS DISTINCT FROM OLD.free_listings_used THEN
    RAISE EXCEPTION 'free_listings_used is system-controlled';
  END IF;

  IF NEW.role_selected_at IS DISTINCT FROM OLD.role_selected_at THEN
    RAISE EXCEPTION 'role_selected_at is system-controlled';
  END IF;

  IF NEW.landlord_application_status IS DISTINCT FROM OLD.landlord_application_status THEN
    IF NOT (
      OLD.landlord_application_status = 'not_requested'
      AND NEW.landlord_application_status = 'pending'
    ) THEN
      RAISE EXCEPTION 'Only an administrator can approve, reject, or otherwise change landlord application status';
    END IF;
  END IF;

  IF NEW.mover_application_status IS DISTINCT FROM OLD.mover_application_status THEN
    IF NOT (
      OLD.mover_application_status = 'not_requested'
      AND NEW.mover_application_status = 'pending'
    ) THEN
      RAISE EXCEPTION 'Only an administrator can approve, reject, or otherwise change mover application status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_profile_kyc_verification_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_role_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  v_is_admin := EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );

  -- Administrators can manage roles, including reverting a user.
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- A normal authenticated user can never assign themselves admin.
  IF NEW.role = 'admin' THEN
    RAISE EXCEPTION 'Only an administrator can assign the admin role';
  END IF;

  -- The user's own role cannot be switched directly between landlord
  -- and mover. A renter may choose either path.
  IF OLD.role = 'landlord'
     AND NEW.role = 'mover' THEN
    RAISE EXCEPTION 'A landlord cannot switch directly to mover; contact an administrator to revert the role';
  END IF;

  IF OLD.role = 'mover'
     AND NEW.role = 'landlord' THEN
    RAISE EXCEPTION 'A mover cannot switch directly to landlord; contact an administrator to revert the role';
  END IF;

  -- Real-estate is treated as a privileged business role and cannot be
  -- self-assigned by a normal user.
  IF NEW.role = 'real_estate' AND OLD.role IS DISTINCT FROM 'real_estate' THEN
    RAISE EXCEPTION 'Only an administrator can assign the real_estate role';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_profile_role_transition"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_approved_listing_to_community"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caption text;
BEGIN
  IF NEW.approval_status = 'approved'
     AND OLD.approval_status IS DISTINCT FROM 'approved'
     AND NEW.is_published = true THEN

    v_caption := NULLIF(BTRIM(COALESCE(NEW.ai_caption, '')), '');

    IF v_caption IS NULL THEN
      v_caption := format(
        '🏠 %s\n\n📍 %s, %s\n💰 KES %s%s\n\n%s\n\n🔑 Verified listing on Saka Krib.',
        COALESCE(NEW.title, 'Property listing'),
        COALESCE(NEW.city, 'Location not specified'),
        COALESCE(NEW.county, ''),
        to_char(COALESCE(NEW.price_kes, 0), 'FM999,999,999'),
        CASE WHEN lower(COALESCE(NEW.listing_type, 'rent')) = 'rent' THEN '/month' ELSE '' END,
        COALESCE(NEW.description, '')
      );
    END IF;

    INSERT INTO public.community_posts (
      user_id,
      listing_id,
      content,
      ai_caption,
      post_type,
      created_at
    )
    SELECT
      NEW.user_id,
      NEW.id,
      v_caption,
      NULLIF(BTRIM(COALESCE(NEW.ai_caption, '')), ''),
      'listing',
      now()
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.community_posts cp
      WHERE cp.listing_id = NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."publish_approved_listing_to_community"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_notification_email"("p_recipient" "text", "p_subject" "text", "p_html_body" "text", "p_template_type" "text" DEFAULT 'generic'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
INSERT INTO notification_emails (recipient, subject, html_body, template_type)
VALUES (p_recipient, p_subject, p_html_body, p_template_type);
END;
$$;


ALTER FUNCTION "public"."queue_notification_email"("p_recipient" "text", "p_subject" "text", "p_html_body" "text", "p_template_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_payment_success_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text;
  v_full_name text;
  v_title text;
  v_listing_title text;
  v_listing_city text;
  v_provider text;
  v_reference text;
  v_amount numeric;
  v_payment_method text;
  v_body text;
  v_data jsonb;
begin
  if old.status is not distinct from new.status or upper(coalesce(new.status,'')) <> 'PAID' then
    return new;
  end if;

  select p.email, p.full_name
    into v_email, v_full_name
    from public.profiles p
   where p.id = new.user_id;

  if v_email is null then
    return new;
  end if;

  select l.title, l.city
    into v_listing_title, v_listing_city
    from public.listings l
   where l.id = new.listing_id;

  v_amount := coalesce(new.amount_kes, 1000);
  v_provider := coalesce(new.payment_provider, 'PAYMENT PROVIDER');
  v_payment_method := coalesce(new.payment_method, v_provider);
  v_reference := coalesce(new.provider_reference, new.mpesa_receipt, new.checkout_request_id, new.id::text);
  v_title := 'Listing payment successful';

  v_data := jsonb_build_object(
    'payment_id', new.id,
    'listing_id', new.listing_id,
    'amount_kes', v_amount,
    'provider', v_provider,
    'payment_method', v_payment_method,
    'provider_reference', v_reference,
    'paid_at', new.paid_at
  );

  insert into public.user_notifications(user_id, notification_type, title, message, data)
  values (
    new.user_id,
    'listing_payment_success',
    v_title,
    format('Your KES %s listing payment was confirmed successfully. Your listing%s has been authorized for review.',
      to_char(v_amount, 'FM999,999,999.00'),
      case when v_listing_title is not null then format(' "%s"', v_listing_title) else '' end),
    v_data
  );

  v_body := format(
    '<p>Dear <strong>%s</strong>,</p>
     <p>Your individual listing payment has been <strong>successfully confirmed</strong>.</p>
     <div style="margin:20px 0;padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
       <p style="margin:4px 0"><strong>Amount:</strong> KES %s</p>
       <p style="margin:4px 0"><strong>Payment method:</strong> %s</p>
       <p style="margin:4px 0"><strong>Provider:</strong> %s</p>
       <p style="margin:4px 0"><strong>Reference:</strong> %s</p>
       %s
       <p style="margin:4px 0"><strong>Paid:</strong> %s</p>
     </div>
     <p>Your listing has been authorized for the normal review workflow. Payment does not bypass administrator approval or publication controls.</p>',
    coalesce(v_full_name, 'SakaHao user'),
    to_char(v_amount, 'FM999,999,999.00'),
    v_payment_method,
    v_provider,
    v_reference,
    case when v_listing_title is not null then format('<p style="margin:4px 0"><strong>Listing:</strong> %s%s</p>', v_listing_title, case when v_listing_city is not null then format(', %s', v_listing_city) else '' end) else '' end,
    to_char(coalesce(new.paid_at, now()), 'DD Mon YYYY HH24:MI')
  );

  perform public.queue_notification_email(
    v_email,
    'Listing Payment Confirmed - SakaHao',
    v_body,
    'listing_payment_success'
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."queue_payment_success_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_subscription_payment_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_email text;
  v_full_name text;
  v_plan_name text;
  v_billing_cycle text;
  v_subscription_id uuid;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_amount numeric;
  v_reference text;
  v_payment_method text;
  v_body text;
  v_data jsonb;
begin
  if old.status is not distinct from new.status or upper(coalesce(new.status,'')) <> 'PAID' then
    return new;
  end if;

  if new.landlord_subscription_id is not null then
    select s.landlord_id, s.id, s.billing_cycle, s.current_period_start, s.current_period_end, sp.name
      into v_user_id, v_subscription_id, v_billing_cycle, v_period_start, v_period_end, v_plan_name
      from public.landlord_subscriptions s
      join public.subscription_plans sp on sp.id = s.plan_id
     where s.id = new.landlord_subscription_id;
  elsif new.real_estate_subscription_id is not null then
    select s.real_estate_id, s.id, s.billing_cycle, s.current_period_start, s.current_period_end, sp.name
      into v_user_id, v_subscription_id, v_billing_cycle, v_period_start, v_period_end, v_plan_name
      from public.real_estate_subscriptions s
      join public.subscription_plans sp on sp.id = s.plan_id
     where s.id = new.real_estate_subscription_id;
  else
    return new;
  end if;

  if v_user_id is null then
    return new;
  end if;

  select p.email, p.full_name
    into v_email, v_full_name
    from public.profiles p
   where p.id = v_user_id;

  if v_email is null then
    return new;
  end if;

  v_amount := new.amount_kes;
  v_payment_method := coalesce(new.payment_method, new.payment_provider, 'PAYMENT PROVIDER');
  v_reference := coalesce(new.provider_reference, new.mpesa_receipt, new.checkout_request_id, new.id::text);

  v_data := jsonb_build_object(
    'invoice_id', new.id,
    'subscription_id', v_subscription_id,
    'plan_name', v_plan_name,
    'billing_cycle', v_billing_cycle,
    'amount_kes', v_amount,
    'payment_method', v_payment_method,
    'provider', new.payment_provider,
    'provider_reference', v_reference,
    'invoice_status', new.status,
    'paid_at', new.paid_at,
    'period_start', v_period_start,
    'period_end', v_period_end
  );

  insert into public.user_notifications(user_id, notification_type, title, message, data)
  values (
    v_user_id,
    'subscription_payment_success',
    'Subscription payment successful',
    format('Your %s %s subscription payment of KES %s was confirmed. Your subscription is now active.',
      coalesce(v_plan_name, 'SakaHao'),
      lower(coalesce(v_billing_cycle, 'subscription')),
      to_char(v_amount, 'FM999,999,999.00')),
    v_data
  );

  v_body := format(
    '<p>Dear <strong>%s</strong>,</p>
     <p>Your SakaHao subscription payment has been <strong>successfully confirmed</strong>. This email serves as your payment receipt/invoice confirmation.</p>
     <div style="margin:20px 0;padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
       <h3 style="margin:0 0 12px;color:#0f172a">Subscription Invoice</h3>
       <p style="margin:4px 0"><strong>Plan:</strong> %s</p>
       <p style="margin:4px 0"><strong>Billing cycle:</strong> %s</p>
       <p style="margin:4px 0"><strong>Amount paid:</strong> KES %s</p>
       <p style="margin:4px 0"><strong>Payment method:</strong> %s</p>
       <p style="margin:4px 0"><strong>Provider reference:</strong> %s</p>
       <p style="margin:4px 0"><strong>Invoice ID:</strong> %s</p>
       <p style="margin:4px 0"><strong>Payment date:</strong> %s</p>
       <p style="margin:4px 0"><strong>Subscription period:</strong> %s - %s</p>
     </div>
     <p>Your subscription is active and its listing/PMS entitlements are now available according to the plan.</p>',
    coalesce(v_full_name, 'SakaHao user'),
    coalesce(v_plan_name, 'Subscription'),
    coalesce(v_billing_cycle, 'N/A'),
    to_char(v_amount, 'FM999,999,999.00'),
    v_payment_method,
    v_reference,
    new.id,
    to_char(coalesce(new.paid_at, now()), 'DD Mon YYYY HH24:MI'),
    to_char(v_period_start, 'DD Mon YYYY'),
    to_char(v_period_end, 'DD Mon YYYY')
  );

  perform public.queue_notification_email(
    v_email,
    format('Subscription Invoice & Payment Confirmation - %s', coalesce(v_plan_name, 'SakaHao')),
    v_body,
    'subscription_payment_success'
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."queue_subscription_payment_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_mover_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision, "p_accuracy_meters" double precision DEFAULT NULL::double precision, "p_speed_kph" double precision DEFAULT NULL::double precision, "p_heading_degrees" double precision DEFAULT NULL::double precision) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_b public.bookings%rowtype;
  v_last_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    raise exception 'Invalid coordinates';
  end if;
  if p_accuracy_meters is not null and (p_accuracy_meters < 0 or p_accuracy_meters > 10000) then
    raise exception 'Invalid accuracy';
  end if;
  if p_speed_kph is not null and (p_speed_kph < 0 or p_speed_kph > 300) then
    raise exception 'Invalid speed';
  end if;
  if p_heading_degrees is not null and (p_heading_degrees < 0 or p_heading_degrees >= 360) then
    raise exception 'Invalid heading';
  end if;

  select b.* into v_b
  from public.bookings b
  join public.movers m on m.id = b.mover_id
  where b.id = p_booking_id and m.user_id = v_uid
  for update;

  if not found then raise exception 'Booking not found or unauthorized'; end if;
  if v_b.status <> 'in_progress' then raise exception 'Journey is not in progress'; end if;
  if v_b.payment_status <> 'paid' then raise exception 'Payment required before tracking'; end if;
  if v_b.started_at is null or v_b.completed_at is not null then raise exception 'Journey is not active'; end if;

  select t.recorded_at into v_last_at
  from public.moving_tracking_points t
  where t.booking_id = p_booking_id
  order by t.recorded_at desc
  limit 1;

  if v_last_at is not null and v_last_at > v_now - interval '5 seconds' then
    return jsonb_build_object(
      'accepted', false,
      'throttled', true,
      'booking_id', p_booking_id,
      'recorded_at', v_last_at
    );
  end if;

  insert into public.moving_tracking_points
    (booking_id, mover_id, latitude, longitude, accuracy_meters, speed_kph, heading_degrees, recorded_at)
  values
    (p_booking_id, v_b.mover_id, p_latitude, p_longitude, p_accuracy_meters, p_speed_kph, p_heading_degrees, v_now);

  update public.movers
  set current_latitude = p_latitude,
      current_longitude = p_longitude,
      location_updated_at = v_now,
      updated_at = v_now
  where id = v_b.mover_id;

  update public.bookings
  set last_known_latitude = p_latitude,
      last_known_longitude = p_longitude,
      last_location_at = v_now,
      updated_at = v_now
  where id = p_booking_id;

  return jsonb_build_object(
    'accepted', true,
    'throttled', false,
    'booking_id', p_booking_id,
    'latitude', p_latitude,
    'longitude', p_longitude,
    'recorded_at', v_now
  );
end;
$$;


ALTER FUNCTION "public"."record_mover_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision, "p_accuracy_meters" double precision, "p_speed_kph" double precision, "p_heading_degrees" double precision) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moving_tracking_points" (
    "id" bigint NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "mover_id" "uuid" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "accuracy_meters" double precision,
    "speed_kph" double precision,
    "heading_degrees" double precision,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "moving_tracking_points_latitude_check" CHECK ((("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision))),
    CONSTRAINT "moving_tracking_points_longitude_check" CHECK ((("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision)))
);

ALTER TABLE ONLY "public"."moving_tracking_points" REPLICA IDENTITY FULL;


ALTER TABLE "public"."moving_tracking_points" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_moving_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision, "p_accuracy_meters" double precision DEFAULT NULL::double precision, "p_speed_kph" double precision DEFAULT NULL::double precision, "p_heading_degrees" double precision DEFAULT NULL::double precision, "p_recorded_at" timestamp with time zone DEFAULT "now"()) RETURNS "public"."moving_tracking_points"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_mover_id uuid; v_point public.moving_tracking_points; v_now timestamptz:=clock_timestamp();
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_latitude is null or p_latitude not between -90 and 90 then raise exception 'Invalid latitude'; end if;
 if p_longitude is null or p_longitude not between -180 and 180 then raise exception 'Invalid longitude'; end if;
 if p_accuracy_meters is not null and (p_accuracy_meters<0 or p_accuracy_meters>10000) then raise exception 'Invalid accuracy'; end if;
 if p_speed_kph is not null and (p_speed_kph<0 or p_speed_kph>300) then raise exception 'Invalid speed'; end if;
 if p_heading_degrees is not null and (p_heading_degrees<0 or p_heading_degrees>=360) then raise exception 'Invalid heading'; end if;
 select b.mover_id into v_mover_id from public.bookings b join public.movers m on m.id=b.mover_id where b.id=p_booking_id and m.user_id=auth.uid() and b.status='in_progress' and b.started_at is not null and b.completed_at is null for update;
 if v_mover_id is null then raise exception 'Only the assigned mover can record GPS while the journey is active'; end if;
 if coalesce(p_recorded_at,v_now) > v_now + interval '30 seconds' then raise exception 'Recorded time cannot be in the future'; end if;
 if coalesce(p_recorded_at,v_now) < v_now - interval '10 minutes' then raise exception 'Recorded time is too old'; end if;
 insert into public.moving_tracking_points(booking_id,mover_id,latitude,longitude,accuracy_meters,speed_kph,heading_degrees,recorded_at) values(p_booking_id,v_mover_id,p_latitude,p_longitude,p_accuracy_meters,p_speed_kph,p_heading_degrees,coalesce(p_recorded_at,v_now)) returning * into v_point;
 update public.movers set current_latitude=p_latitude,current_longitude=p_longitude,location_updated_at=v_point.recorded_at,updated_at=v_now where id=v_mover_id;
 update public.bookings set last_known_latitude=p_latitude,last_known_longitude=p_longitude,last_location_at=v_point.recorded_at,updated_at=v_now where id=p_booking_id;
 return v_point;
end; $$;


ALTER FUNCTION "public"."record_moving_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision, "p_accuracy_meters" double precision, "p_speed_kph" double precision, "p_heading_degrees" double precision, "p_recorded_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_moving_payment"("p_booking_id" "uuid", "p_provider" "text", "p_provider_reference" "text", "p_provider_transaction_id" "text", "p_amount_kes" numeric, "p_mpesa_receipt" "text" DEFAULT NULL::"text", "p_paypal_order_id" "text" DEFAULT NULL::"text", "p_provider_currency" "text" DEFAULT 'KES'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_b public.bookings%rowtype; v_m public.movers%rowtype;
  v_invoice_id uuid; v_payment_id uuid; v_existing_payment_id uuid; v_existing_invoice_id uuid;
  v_invoice_number text; v_fee numeric; v_net numeric;
begin
  if p_provider not in ('MPESA','PAYPAL') then raise exception 'Unsupported payment provider'; end if;
  if p_provider_reference is null or btrim(p_provider_reference)='' then raise exception 'Provider reference is required'; end if;
  select * into v_b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if v_b.status <> 'confirmed' then raise exception 'Booking must be confirmed before payment'; end if;
  if p_amount_kes <> v_b.total_amount then raise exception 'Payment amount does not match booking total'; end if;

  select mp.id, mp.invoice_id into v_existing_payment_id, v_existing_invoice_id
  from public.moving_payments mp
  where mp.provider=p_provider and mp.provider_reference=p_provider_reference
  limit 1;
  if v_existing_payment_id is not null then
    return jsonb_build_object('booking_id',p_booking_id,'payment_id',v_existing_payment_id,'invoice_id',v_existing_invoice_id,'status','ALREADY_PROCESSED');
  end if;

  if v_b.payment_status='paid' then raise exception 'Booking is already marked paid but provider reference was not found'; end if;
  select * into v_m from public.movers where id=v_b.mover_id;
  if not found then raise exception 'Mover not found'; end if;

  v_fee := coalesce(v_b.commission_amount, round(v_b.total_amount * coalesce((select mover_commission_rate from public.platform_settings where id=true),0.20),2));
  v_net := round(v_b.total_amount-v_fee,2);
  v_invoice_number := 'SK-MOV-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.moving_invoices(booking_id,invoice_number,renter_id,mover_id,amount_kes,platform_fee_kes,mover_net_kes,status,payment_provider,provider_reference,provider_transaction_id,paid_at,mover_name_snapshot,mover_phone_snapshot,vehicle_type_snapshot,number_plate_snapshot,mover_profile_photo_snapshot)
  values(p_booking_id,v_invoice_number,v_b.renter_id,v_b.mover_id,v_b.total_amount,v_fee,v_net,'PAID',p_provider,p_provider_reference,p_provider_transaction_id,now(),v_m.driver_full_name,v_m.phone,v_m.vehicle_type,v_m.number_plate,v_m.profile_photo_url)
  returning id into v_invoice_id;

  insert into public.moving_payments(booking_id,invoice_id,payer_id,amount_kes,provider,status,provider_reference,provider_transaction_id,mpesa_receipt,paypal_order_id,provider_amount,provider_currency,paid_at,released_at)
  values(p_booking_id,v_invoice_id,v_b.renter_id,p_amount_kes,p_provider,'HELD',p_provider_reference,p_provider_transaction_id,p_mpesa_receipt,p_paypal_order_id,p_amount_kes,p_provider_currency,now(),null)
  returning id into v_payment_id;

  update public.bookings set payment_status='paid',payment_method=lower(p_provider),updated_at=now() where id=p_booking_id;

  insert into public.user_notifications(user_id,notification_type,title,message,data)
  values(v_b.renter_id,'MOVING_PAYMENT_PAID','Moving payment received','Your moving payment was received and is being held securely until delivery is confirmed.',jsonb_build_object('booking_id',p_booking_id,'invoice_id',v_invoice_id,'invoice_number',v_invoice_number));
  insert into public.user_notifications(user_id,notification_type,title,message,data)
  values(v_m.user_id,'MOVING_PAYMENT_PAID','Renter paid for the move','The renter has paid. The funds will be released after safe delivery is confirmed.',jsonb_build_object('booking_id',p_booking_id,'invoice_id',v_invoice_id,'invoice_number',v_invoice_number));

  return jsonb_build_object('booking_id',p_booking_id,'payment_id',v_payment_id,'invoice_id',v_invoice_id,'invoice_number',v_invoice_number,'status','HELD','platform_fee_kes',v_fee,'mover_net_kes',v_net);
exception when unique_violation then
  select id, invoice_id into v_existing_payment_id, v_existing_invoice_id from public.moving_payments where provider=p_provider and provider_reference=p_provider_reference limit 1;
  if v_existing_payment_id is not null then return jsonb_build_object('booking_id',p_booking_id,'payment_id',v_existing_payment_id,'invoice_id',v_existing_invoice_id,'status','ALREADY_PROCESSED'); end if;
  raise;
end; $$;


ALTER FUNCTION "public"."record_moving_payment"("p_booking_id" "uuid", "p_provider" "text", "p_provider_reference" "text", "p_provider_transaction_id" "text", "p_amount_kes" numeric, "p_mpesa_receipt" "text", "p_paypal_order_id" "text", "p_provider_currency" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_rent_payment"("p_submission_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_landlord uuid:=auth.uid(); v_sub record; v_invoice record; v_reason text:=nullif(trim(p_reason),''); v_renter_email text;
begin
  if v_landlord is null then raise exception 'Authentication required'; end if; if v_reason is null then raise exception 'A rejection reason is required'; end if;
  select * into v_sub from public.rent_payment_submissions where id=p_submission_id for update; if not found or v_sub.landlord_id<>v_landlord then raise exception 'Payment submission not found or not authorized'; end if; if v_sub.status<>'PENDING' then raise exception 'Payment submission is not pending'; end if;
  select * into v_invoice from public.rent_invoices where id=v_sub.invoice_id for update; if not found or v_invoice.landlord_id<>v_landlord then raise exception 'Invoice not found or not authorized'; end if;
  update public.rent_payment_submissions set status='REJECTED',rejection_reason=v_reason,updated_at=now() where id=p_submission_id;
  update public.rent_invoices set status='REJECTED',updated_at=now() where id=v_invoice.id;
  insert into public.user_notifications(user_id,notification_type,title,message,data) values(v_invoice.renter_user_id,'RENT_PAYMENT_REJECTED','Rent payment needs attention','Your landlord could not confirm the submitted rent transaction. Please review the invoice and submit the correct transaction ID.',jsonb_build_object('invoice_id',v_invoice.id,'invoice_number',v_invoice.invoice_number,'submission_id',p_submission_id,'reason',v_reason));
  select email into v_renter_email from public.profiles where id=v_invoice.renter_user_id;
  if v_renter_email is not null then insert into public.notification_emails(recipient,subject,html_body,template_type,status) values(v_renter_email,'Rent payment requires attention - '||v_invoice.invoice_number,'<p>Your landlord could not confirm the transaction submitted for invoice <strong>'||v_invoice.invoice_number||'</strong>.</p><p>Reason: '||v_reason||'</p><p>Please review the invoice and submit the correct transaction ID.</p>','rent_payment_rejected','pending'); end if;
  return jsonb_build_object('success',true,'submission_id',p_submission_id,'invoice_id',v_invoice.id,'status','REJECTED');
end; $$;


ALTER FUNCTION "public"."reject_rent_payment"("p_submission_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_listing_from_pms"("p_subscription_id" "uuid", "p_listing_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_landlord_id uuid;
    v_subscription_status text;
begin

    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;


    -- Verify subscription ownership.
    select
        landlord_id,
        status
    into
        v_landlord_id,
        v_subscription_status
    from public.landlord_subscriptions
    where id = p_subscription_id
      and landlord_id = auth.uid()
    limit 1;


    if v_landlord_id is null then
        raise exception 'Subscription not found or not owned by current user';
    end if;


    -- Only an active/grace subscription can modify PMS assignments.
    if v_subscription_status not in ('ACTIVE', 'GRACE_PERIOD') then
        raise exception 'PMS subscription is not active';
    end if;


    update public.subscription_listings
    set
        status = 'INACTIVE',
        deactivated_at = now()
    where subscription_id = p_subscription_id
      and listing_id = p_listing_id
      and status = 'ACTIVE';


    if not found then
        raise exception 'Listing is not currently managed by this PMS subscription';
    end if;


    return jsonb_build_object(
        'success', true,
        'subscription_id', p_subscription_id,
        'listing_id', p_listing_id,
        'status', 'INACTIVE'
    );

end;
$$;


ALTER FUNCTION "public"."remove_listing_from_pms"("p_subscription_id" "uuid", "p_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_mover_booking"("p_mover_id" "uuid", "p_pickup_address" "text", "p_dropoff_address" "text", "p_pickup_latitude" double precision, "p_pickup_longitude" double precision, "p_dropoff_latitude" double precision, "p_dropoff_longitude" double precision, "p_distance_km" numeric, "p_listing_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_mover public.movers%rowtype;
  v_profile public.profiles%rowtype;
  v_quote jsonb;
  v_booking_id uuid;
  v_total numeric;
  v_fee numeric;
  v_net numeric;
  v_conversation_id text;
  v_deadline timestamptz;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into v_profile from public.profiles where id=v_uid;
  if not found then raise exception 'Profile not found'; end if;
  if v_profile.role <> 'renter' then raise exception 'Only renters can request a mover'; end if;

  if p_pickup_address is null or btrim(p_pickup_address)='' then raise exception 'Pickup address is required'; end if;
  if p_dropoff_address is null or btrim(p_dropoff_address)='' then raise exception 'Dropoff address is required'; end if;
  if p_distance_km is null or p_distance_km<0 then raise exception 'Invalid distance'; end if;
  if p_pickup_latitude is null or p_dropoff_latitude is null or p_pickup_latitude not between -90 and 90 or p_dropoff_latitude not between -90 and 90 then raise exception 'Invalid latitude'; end if;
  if p_pickup_longitude is null or p_dropoff_longitude is null or p_pickup_longitude not between -180 and 180 or p_dropoff_longitude not between -180 and 180 then raise exception 'Invalid longitude'; end if;

  select * into v_mover from public.movers where id=p_mover_id and is_available=true and approval_status='approved';
  if not found then raise exception 'Mover is not currently available'; end if;

  select * into v_profile from public.profiles where id=v_mover.user_id;
  if not found or v_profile.verification_status<>'verified' or v_profile.mover_application_status<>'approved' then raise exception 'Mover is not verified and approved'; end if;

  v_quote := public.calculate_mover_quote(p_mover_id,p_distance_km);
  v_total := (v_quote->>'renter_total_kes')::numeric;
  v_fee := (v_quote->>'platform_fee_kes')::numeric;
  v_net := (v_quote->>'mover_net_kes')::numeric;
  v_deadline := now()+interval '30 minutes';

  insert into public.bookings(
    renter_id,mover_id,listing_id,pickup_address,dropoff_address,moving_date,
    booking_amount,commission_amount,total_amount,status,payment_status,payment_method,
    distance_km,rate_per_km_kes,base_rate_kes,pickup_latitude,pickup_longitude,
    dropoff_latitude,dropoff_longitude,requested_at,request_expires_at
  ) values(
    v_uid,p_mover_id,p_listing_id,p_pickup_address,p_dropoff_address,current_date,
    v_total,v_fee,v_total,'pending','unpaid',null,p_distance_km,
    (v_quote->>'rate_per_km_kes')::numeric,(v_quote->>'base_rate_kes')::numeric,
    p_pickup_latitude,p_pickup_longitude,p_dropoff_latitude,p_dropoff_longitude,now(),v_deadline
  ) returning id into v_booking_id;

  -- One canonical conversation per renter/mover pair. The booking is metadata,
  -- not the conversation identity, so later bookings remain in the same chat.
  v_conversation_id := ((least(v_uid,v_mover.user_id))::text || '__'::text || (greatest(v_uid,v_mover.user_id))::text);

  insert into public.chat_messages(conversation_id,sender_id,receiver_id,content,message_type,event_data)
  values(
    v_conversation_id,v_uid,v_mover.user_id,
    'Moving request received. Please respond within 30 minutes. Pickup: '||p_pickup_address||'. Destination: '||p_dropoff_address||'. Distance: '||round(p_distance_km,2)||' km. Estimated total: KES '||to_char(v_total,'FM999,999,990.00')||'.',
    'booking_request',
    jsonb_build_object('booking_id',v_booking_id,'distance_km',p_distance_km,'rate_per_km_kes',v_quote->>'rate_per_km_kes','renter_total_kes',v_total,'platform_fee_kes',v_fee,'mover_net_kes',v_net,'pickup_latitude',p_pickup_latitude,'pickup_longitude',p_pickup_longitude,'dropoff_latitude',p_dropoff_latitude,'dropoff_longitude',p_dropoff_longitude,'request_expires_at',v_deadline)
  );

  insert into public.user_notifications(user_id,notification_type,title,message,data)
  values(v_mover.user_id,'MOVER_REQUEST','New moving request','A renter has requested your moving service. You have 30 minutes to respond.',jsonb_build_object('booking_id',v_booking_id,'expires_at',v_deadline));

  insert into public.notification_emails(recipient,subject,html_body,template_type,status)
  values(v_profile.email,'New Saka Krib moving request','<p>You have received a new moving request on Saka Krib.</p><p>Please open the app to review and respond within 30 minutes.</p>','MOVER_REQUEST','pending');

  return jsonb_build_object('booking_id',v_booking_id,'conversation_id',v_conversation_id,'status','pending','request_expires_at',v_deadline,'quote',v_quote);
end;
$$;


ALTER FUNCTION "public"."request_mover_booking"("p_mover_id" "uuid", "p_pickup_address" "text", "p_dropoff_address" "text", "p_pickup_latitude" double precision, "p_pickup_longitude" double precision, "p_dropoff_latitude" double precision, "p_dropoff_longitude" double precision, "p_distance_km" numeric, "p_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resend_renter_invitation"("p_association_id" "uuid", "p_app_base_url" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_landlord uuid := auth.uid();
  v_row public.renter_unit_associations;
  v_raw_token text;
begin
  if v_landlord is null then
    raise exception 'Authentication required';
  end if;

  v_raw_token := encode(gen_random_bytes(32), 'hex');

  update public.renter_unit_associations
  set invite_token_hash = encode(digest(v_raw_token, 'sha256'), 'hex'),
      invited_at = now(),
      invite_expires_at = now() + interval '14 days',
      updated_at = now()
  where id = p_association_id
    and landlord_id = v_landlord
    and status = 'PENDING'
  returning * into v_row;

  if not found then
    raise exception 'Pending invitation not found or not owned by this account';
  end if;

  if p_app_base_url is not null then
    begin
      insert into public.notification_emails (
        recipient, subject, html_body, template_type, status
      ) values (
        v_row.renter_email,
        'Reminder: you''ve been invited to SakaCrib',
        '<p>Reminder: open this link to claim your rental:</p>'
          || '<p><a href="' || p_app_base_url || '/#claim-rental/' || v_raw_token || '">'
          || p_app_base_url || '/#claim-rental/' || v_raw_token || '</a></p>'
          || '<p>This link expires in 14 days.</p>',
        'renter_invitation',
        'pending'
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'invited_at', v_row.invited_at,
    'invite_expires_at', v_row.invite_expires_at,
    'invite_token', v_raw_token
  );
end;
$$;


ALTER FUNCTION "public"."resend_renter_invitation"("p_association_id" "uuid", "p_app_base_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_moving_dispute"("p_dispute_id" "uuid", "p_resolution_code" "text", "p_resolution_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid:=auth.uid(); v_d public.moving_disputes%rowtype; v_b public.bookings%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.profiles p where p.id=v_uid and p.role='admin') then raise exception 'Admin access required'; end if;
 if p_resolution_code not in ('RELEASE_TO_MOVER','REFUND_RENTER','PARTIAL_REFUND','NO_REFUND') then raise exception 'Invalid resolution'; end if;
 select * into v_d from public.moving_disputes where id=p_dispute_id for update;
 if not found then raise exception 'Dispute not found'; end if;
 if v_d.status='RESOLVED' then return jsonb_build_object('dispute_id',v_d.id,'status','RESOLVED','already_resolved',true,'resolution_code',v_d.resolution_code); end if;
 select * into v_b from public.bookings where id=v_d.booking_id for update;
 update public.moving_disputes set status='RESOLVED',resolution_code=p_resolution_code,resolution_notes=left(p_resolution_notes,5000),resolved_by=v_uid,resolved_at=now(),updated_at=now() where id=v_d.id;
 update public.bookings set dispute_status='RESOLVED',updated_at=now() where id=v_d.booking_id;
 if p_resolution_code='RELEASE_TO_MOVER' then
   if exists(select 1 from public.mover_payouts where booking_id=v_d.booking_id and final_payment_status='held') then
     return jsonb_build_object('dispute_id',v_d.id,'booking_id',v_d.booking_id,'status','RESOLVED','resolution_code',p_resolution_code,'next_step','ADMIN_MUST_RELEASE_ESCROW');
   end if;
 end if;
 perform public.dispatch_user_notification(v_d.opened_by,'MOVING_DISPUTE_RESOLVED','Moving dispute resolved','An administrator has resolved your moving dispute.',jsonb_build_object('booking_id',v_d.booking_id,'dispute_id',v_d.id,'resolution_code',p_resolution_code), 'moving_dispute_resolved:'||v_d.id::text,true,'moving_dispute_resolved');
 return jsonb_build_object('dispute_id',v_d.id,'booking_id',v_d.booking_id,'status','RESOLVED','resolution_code',p_resolution_code);
end; $$;


ALTER FUNCTION "public"."resolve_moving_dispute"("p_dispute_id" "uuid", "p_resolution_code" "text", "p_resolution_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_mover_booking"("p_booking_id" "uuid", "p_decision" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_b public.bookings%rowtype;
  v_conversation text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('confirm','not_sure','cancel') then raise exception 'Invalid decision'; end if;

  select b.* into v_b
  from public.bookings b
  join public.movers m on m.id = b.mover_id
  where b.id = p_booking_id and m.user_id = v_uid
  for update;

  if not found then raise exception 'Booking not found or unauthorized'; end if;
  if v_b.status <> 'pending' then raise exception 'Booking is no longer awaiting mover response'; end if;
  if coalesce(v_b.request_expires_at, v_b.requested_at + interval '30 minutes') < now() then
    update public.bookings
    set status='cancelled', cancelled_at=now(), cancellation_reason='MOVER_TAKING_TOO_LONG', updated_at=now()
    where id=p_booking_id;
    raise exception 'The 30-minute response window has expired';
  end if;

  v_conversation := ((least(v_b.renter_id, v_uid))::text || '__'::text || (greatest(v_b.renter_id, v_uid))::text);

  if p_decision = 'confirm' then
    update public.bookings
    set status='confirmed', confirmed_at=now(), updated_at=now()
    where id=p_booking_id;

    insert into public.chat_messages(conversation_id,sender_id,receiver_id,content,message_type,event_data)
    values(v_conversation,v_uid,v_b.renter_id,
      'The mover has accepted your request. Please select a moving date and time.',
      'booking_response',
      jsonb_build_object('booking_id',p_booking_id,'decision','confirm'));

    insert into public.user_notifications(user_id,notification_type,title,message,data)
    values(v_b.renter_id,'MOVER_CONFIRMED','Mover confirmed your request',
      'Your selected mover accepted the request. Choose a date and time in chat.',
      jsonb_build_object('booking_id',p_booking_id));

  elsif p_decision = 'not_sure' then
    if p_reason is null or btrim(p_reason)='' then raise exception 'Reason is required for not sure'; end if;

    insert into public.chat_messages(conversation_id,sender_id,receiver_id,content,message_type,event_data)
    values(v_conversation,v_uid,v_b.renter_id,
      'The mover is not sure about this request yet: ' || p_reason,
      'booking_response',
      jsonb_build_object('booking_id',p_booking_id,'decision','not_sure','reason',p_reason));

    insert into public.user_notifications(user_id,notification_type,title,message,data)
    values(v_b.renter_id,'MOVER_NOT_SURE','Mover is not sure',
      'The mover needs more discussion before confirming.',
      jsonb_build_object('booking_id',p_booking_id,'reason',p_reason));
  else
    if p_reason is null or btrim(p_reason)='' then raise exception 'Reason is required for cancellation'; end if;

    update public.bookings
    set status='cancelled', cancelled_at=now(), cancellation_reason='MOVER_DECLINED',
        cancellation_details=p_reason, updated_at=now()
    where id=p_booking_id;

    insert into public.moving_cancellation_events(booking_id,cancelled_by,reason_code,reason_text)
    values(p_booking_id,v_uid,'MOVER_CANCELLED',p_reason);

    insert into public.chat_messages(conversation_id,sender_id,receiver_id,content,message_type,event_data)
    values(v_conversation,v_uid,v_b.renter_id,
      'The mover cancelled the request: ' || p_reason,
      'booking_response',
      jsonb_build_object('booking_id',p_booking_id,'decision','cancel','reason',p_reason));

    insert into public.user_notifications(user_id,notification_type,title,message,data)
    values(v_b.renter_id,'MOVER_CANCELLED','Mover cancelled the request',
      'The mover cancelled your moving request.',
      jsonb_build_object('booking_id',p_booking_id,'reason',p_reason));
  end if;

  return jsonb_build_object(
    'booking_id',p_booking_id,
    'decision',p_decision,
    'status',(select status from public.bookings where id=p_booking_id)
  );
end;
$$;


ALTER FUNCTION "public"."respond_to_mover_booking"("p_booking_id" "uuid", "p_decision" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_mover_after_delivery"("p_booking_id" "uuid", "p_rating" integer, "p_comment" "text" DEFAULT ''::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid:=auth.uid(); v_b public.bookings%rowtype; v_m public.movers%rowtype; v_review_id uuid;
begin
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating must be between 1 and 5'; end if;
  select b.* into v_b from public.bookings b where b.id=p_booking_id and b.renter_id=v_uid;
  if not found then raise exception 'Booking not found or unauthorized'; end if;
  if v_b.status <> 'completed' or v_b.renter_confirmed_delivery_at is null then raise exception 'Delivery must be confirmed first'; end if;
  select * into v_m from public.movers where id=v_b.mover_id;
  if exists(select 1 from public.reviews where booking_id=p_booking_id) then raise exception 'This booking has already been reviewed'; end if;

  insert into public.reviews(reviewer_id,reviewee_id,mover_id,rating,comment,review_type,booking_id)
  values(v_uid,v_m.user_id,v_m.id,p_rating,coalesce(p_comment,''),'mover',p_booking_id)
  returning id into v_review_id;

  insert into public.user_notifications(user_id,notification_type,title,message,data)
  values(v_m.user_id,'MOVER_REVIEW_RECEIVED','You received a mover review','A renter has rated your moving service.',jsonb_build_object('booking_id',p_booking_id,'review_id',v_review_id,'rating',p_rating));

  return jsonb_build_object('review_id',v_review_id,'booking_id',p_booking_id,'rating',p_rating);
end;
$$;


ALTER FUNCTION "public"."review_mover_after_delivery"("p_booking_id" "uuid", "p_rating" integer, "p_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_payment_reminder"("p_renter_assoc_id" "uuid", "p_message" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_landlord uuid := auth.uid();
  v_assoc record;
  v_unit record;
  v_listing record;
  v_final_message text;
begin
  if v_landlord is null then
    raise exception 'Authentication required';
  end if;

  select * into v_assoc
  from public.renter_unit_associations
  where id = p_renter_assoc_id
    and landlord_id = v_landlord
    and status = 'ACTIVE';

  if not found then
    raise exception 'Active renter association not found';
  end if;

  if v_assoc.renter_user_id is null then
    raise exception 'This renter has not yet claimed their account';
  end if;

  select * into v_unit
  from public.property_units
  where id = v_assoc.unit_id;

  select * into v_listing
  from public.listings
  where id = v_unit.listing_id;

  v_final_message := coalesce(
    nullif(trim(p_message), ''),
    'This is a reminder that rent of KES ' || v_assoc.rent_amount
      || ' for ' || v_listing.title || ' - Unit ' || v_unit.unit_number
      || ' is due.'
  );

  insert into public.user_notifications (
    user_id, notification_type, title, message, data
  ) values (
    v_assoc.renter_user_id,
    'PAYMENT_REMINDER',
    'Rent payment reminder',
    v_final_message,
    jsonb_build_object('association_id', v_assoc.id, 'unit_id', v_assoc.unit_id)
  );

  begin
    insert into public.notification_emails (
      recipient, subject, html_body, template_type, status
    ) values (
      v_assoc.renter_email,
      'Rent payment reminder',
      '<p>' || v_final_message || '</p>',
      'payment_reminder',
      'pending'
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'in_app_sent', true,
    'email_sent', true,
    'whatsapp_sent', false
  );
end;
$$;


ALTER FUNCTION "public"."send_payment_reminder"("p_renter_assoc_id" "uuid", "p_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_booking_mover_pricing"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_mover public.movers%rowtype;
  v_settings public.platform_settings%rowtype;
  v_distance numeric;
  v_mover_charge numeric;
  v_markup numeric;
  v_total numeric;
  v_commission numeric;
begin
  if new.distance_km is null or new.distance_km < 0 then
    raise exception 'distance_km must be zero or greater';
  end if;

  select * into v_mover
  from public.movers
  where id = new.mover_id;

  if not found then
    raise exception 'Mover not found';
  end if;

  if tg_op = 'INSERT' then
    if v_mover.approval_status <> 'approved' or not v_mover.is_available then
      raise exception 'Selected mover is not approved or available';
    end if;
  end if;

  select * into v_settings
  from public.platform_settings
  where id = true;

  v_distance := round(new.distance_km, 3);
  v_mover_charge := round(coalesce(v_mover.base_rate_kes, 0) + (v_distance * coalesce(v_mover.rate_per_km_kes, 0)), 2);
  v_markup := round(v_mover_charge * v_settings.mover_operational_markup_rate, 2);
  v_total := round(v_mover_charge + v_markup, 2);
  v_commission := round(v_mover_charge * v_settings.mover_commission_rate, 2);

  new.distance_km := v_distance;
  new.base_rate_kes := round(coalesce(v_mover.base_rate_kes, 0), 2);
  new.rate_per_km_kes := round(coalesce(v_mover.rate_per_km_kes, 0), 2);
  new.booking_amount := v_total;
  new.commission_amount := v_commission;
  new.total_amount := v_total;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_booking_mover_pricing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_landlord_payment_method_default"("p_payment_method_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  update public.landlord_payment_methods
     set is_default = false, updated_at = now()
   where landlord_id = auth.uid();

  update public.landlord_payment_methods
     set is_default = true, updated_at = now()
   where id = p_payment_method_id
     and landlord_id = auth.uid()
     and is_active = true;

  if not found then
    raise exception 'Payment method not found or inactive';
  end if;
end;
$$;


ALTER FUNCTION "public"."set_landlord_payment_method_default"("p_payment_method_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_otp_verifications_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_otp_verifications_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_platform_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_platform_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_subscription_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin

    new.updated_at = now();

    return new;

end;
$$;


ALTER FUNCTION "public"."set_subscription_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_moving_journey"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid:=auth.uid(); v_b public.bookings%rowtype; v_tracking text; v_mover_user uuid;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select b.* into v_b from public.bookings b where b.id=p_booking_id for update;
 if not found then raise exception 'Booking not found'; end if;
 select m.user_id into v_mover_user from public.movers m where m.id=v_b.mover_id;
 if v_mover_user<>v_uid then raise exception 'Only the assigned mover can start the journey'; end if;
 if v_b.payment_status<>'paid' then raise exception 'Booking must be paid before starting'; end if;
 if v_b.status not in ('confirmed') then raise exception 'Booking must be confirmed before starting'; end if;
 if v_b.scheduled_start_at is null then raise exception 'Moving time must be scheduled'; end if;
 if v_b.scheduled_end_at is not null and v_b.scheduled_end_at<=v_b.scheduled_start_at then raise exception 'Invalid scheduled time'; end if;
 if v_b.started_at is not null then return jsonb_build_object('booking_id',p_booking_id,'tracking_number',v_b.tracking_number,'started_at',v_b.started_at,'status','already_started'); end if;
 v_tracking:='SK-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 update public.bookings set tracking_number=v_tracking,started_at=now(),status='in_progress',updated_at=now() where id=p_booking_id;
 insert into public.booking_events(conversation_id,renter_id,mover_id,mover_profile_id,relocation_date,day_of_week,pickup_time,pickup_address,dropoff_address,negotiated_price,commission_amount,total_amount,status,payment_method,confirmed_at,paid_at,distance_km,rate_per_km_kes,base_rate_kes)
 values(p_booking_id::text,v_b.renter_id,v_mover_user,v_b.mover_id,v_b.moving_date,trim(to_char(v_b.moving_date,'Day')),v_b.scheduled_start_at::time,v_b.pickup_address,v_b.dropoff_address,v_b.booking_amount,v_b.commission_amount,v_b.total_amount,'moving_started',coalesce(v_b.payment_method,''),v_b.confirmed_at,now(),v_b.distance_km,v_b.rate_per_km_kes,v_b.base_rate_kes);
 insert into public.user_notifications(user_id,notification_type,title,message,data) values(v_b.renter_id,'MOVING_STARTED','Your move has started','Your mover has started the journey. Your tracking number is '||v_tracking||'.',jsonb_build_object('booking_id',p_booking_id,'tracking_number',v_tracking));
 insert into public.user_notifications(user_id,notification_type,title,message,data) values(v_mover_user,'MOVING_STARTED','Journey started','The moving journey is now active.',jsonb_build_object('booking_id',p_booking_id,'tracking_number',v_tracking));
 return jsonb_build_object('booking_id',p_booking_id,'tracking_number',v_tracking,'started_at',now(),'status','started');
end; $$;


ALTER FUNCTION "public"."start_moving_journey"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_kyc_application"("p_full_name" "text", "p_national_id" "text", "p_id_photo_url" "text", "p_selfie_url" "text") RETURNS "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_id_prefix text;
  v_selfie_prefix text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if nullif(trim(p_full_name), '') is null then
    raise exception 'Full name is required.';
  end if;

  if nullif(trim(p_national_id), '') is null then
    raise exception 'National ID is required.';
  end if;

  if nullif(trim(p_id_photo_url), '') is null or nullif(trim(p_selfie_url), '') is null then
    raise exception 'Both KYC documents are required.';
  end if;

  v_id_prefix := v_user_id::text || '/id-';
  v_selfie_prefix := v_user_id::text || '/selfie-';

  if position(v_id_prefix in p_id_photo_url) <> 1 then
    raise exception 'Invalid National ID document path.';
  end if;

  if position(v_selfie_prefix in p_selfie_url) <> 1 then
    raise exception 'Invalid selfie document path.';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  if v_profile.kyc_completed = true then
    raise exception 'KYC has already been submitted.';
  end if;

  perform set_config('app.verification_workflow', 'true', true);

  update public.profiles
  set
    full_name = trim(p_full_name),
    national_id = trim(p_national_id),
    id_photo_url = trim(p_id_photo_url),
    selfie_url = trim(p_selfie_url),
    kyc_completed = true,
    verification_status = 'pending_verification'
  where id = v_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;


ALTER FUNCTION "public"."submit_kyc_application"("p_full_name" "text", "p_national_id" "text", "p_id_photo_url" "text", "p_selfie_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_landlord_application"("p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_email" "text", "p_phone" "text", "p_national_id" "text", "p_document_type" "text", "p_document_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_profile.role NOT IN ('renter', 'landlord') THEN
    RAISE EXCEPTION 'Only renter or landlord accounts can submit a landlord application';
  END IF;

  IF v_profile.landlord_application_status IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'A landlord application is already pending or approved';
  END IF;

  IF p_document_type NOT IN ('national_id', 'passport')
     OR COALESCE(trim(p_document_url), '') = '' THEN
    RAISE EXCEPTION 'Identity document is required';
  END IF;

  UPDATE public.profiles
  SET first_name = trim(p_first_name),
      middle_name = trim(COALESCE(p_middle_name, '')),
      last_name = trim(p_last_name),
      full_name = trim(concat_ws(' ', p_first_name, p_middle_name, p_last_name)),
      email = trim(p_email),
      phone = trim(p_phone),
      national_id = trim(p_national_id),
      id_document_type = p_document_type,
      id_document_url = p_document_url,
      landlord_application_status = 'pending'
  WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."submit_landlord_application"("p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_email" "text", "p_phone" "text", "p_national_id" "text", "p_document_type" "text", "p_document_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_mover_application"("p_application" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_latitude double precision;
  v_longitude double precision;
  v_mover_id uuid;
  v_existing_mover movers%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PROFILE_NOT_FOUND',
      'status', 'not_found',
      'message', 'We could not find your account profile. Please sign in again and try again.'
    );
  END IF;

  -- Both renter and mover roles are eligible to submit a mover application.
  -- The application status controls whether a new application may be submitted.
  IF v_profile.role NOT IN ('renter', 'mover') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_ROLE',
      'status', 'blocked',
      'message', 'Only renter or mover accounts can submit a mover application.'
    );
  END IF;

  IF v_profile.mover_application_status = 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'MOVER_APPLICATION_ALREADY_PENDING',
      'status', 'pending',
      'message', 'Your mover application is already under review. Please wait for an administrator to complete the review.'
    );
  END IF;

  IF v_profile.mover_application_status = 'approved' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'MOVER_ALREADY_APPROVED',
      'status', 'approved',
      'message', 'Your mover application has already been approved. You can manage your mover services from your dashboard.'
    );
  END IF;

  SELECT * INTO v_existing_mover
  FROM movers
  WHERE user_id = auth.uid();

  IF v_existing_mover.id IS NOT NULL AND v_existing_mover.approval_status = 'pending_review' THEN
    UPDATE profiles
    SET mover_application_status = 'pending'
    WHERE id = auth.uid();

    RETURN jsonb_build_object(
      'success', false,
      'code', 'MOVER_APPLICATION_ALREADY_PENDING',
      'status', 'pending',
      'message', 'Your mover application is already under review. Please wait for an administrator to complete the review.'
    );
  END IF;

  IF v_existing_mover.id IS NOT NULL AND v_existing_mover.approval_status = 'approved' THEN
    UPDATE profiles
    SET mover_application_status = 'approved'
    WHERE id = auth.uid();

    RETURN jsonb_build_object(
      'success', false,
      'code', 'MOVER_ALREADY_APPROVED',
      'status', 'approved',
      'message', 'Your mover application has already been approved. You can manage your mover services from your dashboard.'
    );
  END IF;

  IF COALESCE(p_application->>'dl_photo_url', '') = '' OR COALESCE(p_application->>'number_plate', '') = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'MOVER_EVIDENCE_REQUIRED',
      'status', 'invalid',
      'message', 'Your driving licence photo and vehicle number plate are required before you can submit your mover application.'
    );
  END IF;

  IF COALESCE(p_application->>'capacity_details', '') = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VEHICLE_CAPACITY_REQUIRED',
      'status', 'invalid',
      'message', 'Please provide your vehicle capacity details before submitting your mover application.'
    );
  END IF;

  IF COALESCE((p_application->>'terms_accepted')::boolean, false) <> true THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'TERMS_NOT_ACCEPTED',
      'status', 'invalid',
      'message', 'Please accept the Mover Terms and Conditions before submitting your application.'
    );
  END IF;

  v_latitude := NULLIF(p_application->>'latitude', '')::double precision;
  v_longitude := NULLIF(p_application->>'longitude', '')::double precision;

  IF v_latitude IS NOT NULL AND (v_latitude < -90 OR v_latitude > 90) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_LATITUDE',
      'status', 'invalid',
      'message', 'The captured GPS latitude is invalid. Please capture your location again.'
    );
  END IF;

  IF v_longitude IS NOT NULL AND (v_longitude < -180 OR v_longitude > 180) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_LONGITUDE',
      'status', 'invalid',
      'message', 'The captured GPS longitude is invalid. Please capture your location again.'
    );
  END IF;

  INSERT INTO movers (
    user_id, driver_full_name, national_id, dl_number, dl_photo_url,
    vehicle_type, number_plate, capacity_details, operating_city,
    operating_county, phone, base_rate_kes, rate_per_km_kes,
    payment_channel, payment_account, liability_accepted,
    insurance_policy_details, vehicle_inspection_expiry, terms_accepted,
    reference_contacts, current_latitude, current_longitude,
    location_updated_at, location, is_available, approval_status
  ) VALUES (
    auth.uid(), p_application->>'driver_full_name', p_application->>'national_id',
    p_application->>'dl_number', p_application->>'dl_photo_url', p_application->>'vehicle_type',
    upper(p_application->>'number_plate'), p_application->>'capacity_details',
    p_application->>'operating_city', p_application->>'operating_county', p_application->>'phone',
    COALESCE((p_application->>'base_rate_kes')::numeric, 0),
    COALESCE((p_application->>'rate_per_km_kes')::numeric, 0), p_application->>'payment_channel',
    p_application->>'payment_account', COALESCE((p_application->>'liability_accepted')::boolean, false),
    p_application->>'insurance_policy_details', NULLIF(p_application->>'vehicle_inspection_expiry', '')::date,
    COALESCE((p_application->>'terms_accepted')::boolean, false),
    COALESCE(p_application->'reference_contacts', '[]'::jsonb), v_latitude, v_longitude,
    CASE WHEN v_latitude IS NOT NULL AND v_longitude IS NOT NULL THEN now() ELSE NULL END,
    NULLIF(btrim(p_application->>'location'), ''), false, 'pending_review'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    driver_full_name = EXCLUDED.driver_full_name,
    national_id = EXCLUDED.national_id,
    dl_number = EXCLUDED.dl_number,
    dl_photo_url = EXCLUDED.dl_photo_url,
    vehicle_type = EXCLUDED.vehicle_type,
    number_plate = EXCLUDED.number_plate,
    capacity_details = EXCLUDED.capacity_details,
    operating_city = EXCLUDED.operating_city,
    operating_county = EXCLUDED.operating_county,
    phone = EXCLUDED.phone,
    base_rate_kes = EXCLUDED.base_rate_kes,
    rate_per_km_kes = EXCLUDED.rate_per_km_kes,
    payment_channel = EXCLUDED.payment_channel,
    payment_account = EXCLUDED.payment_account,
    liability_accepted = EXCLUDED.liability_accepted,
    insurance_policy_details = EXCLUDED.insurance_policy_details,
    vehicle_inspection_expiry = EXCLUDED.vehicle_inspection_expiry,
    terms_accepted = EXCLUDED.terms_accepted,
    reference_contacts = EXCLUDED.reference_contacts,
    current_latitude = EXCLUDED.current_latitude,
    current_longitude = EXCLUDED.current_longitude,
    location_updated_at = EXCLUDED.location_updated_at,
    location = EXCLUDED.location,
    is_available = false,
    approval_status = 'pending_review'
  RETURNING id INTO v_mover_id;

  UPDATE profiles
  SET mover_application_status = 'pending'
  WHERE id = auth.uid();

  RETURN jsonb_build_object(
    'success', true,
    'code', 'MOVER_APPLICATION_SUBMITTED',
    'status', 'pending',
    'message', 'Your mover application has been submitted successfully and is now awaiting administrator review.',
    'mover_id', v_mover_id,
    'profile_id', auth.uid()
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'MOVER_APPLICATION_ALREADY_EXISTS',
      'status', 'conflict',
      'message', 'A mover application already exists for this account. Please refresh the page and check your application status.'
    );
  WHEN invalid_text_representation OR invalid_datetime_format OR numeric_value_out_of_range THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_APPLICATION_DATA',
      'status', 'invalid',
      'message', 'Some mover application information is invalid. Please review the form and try again.'
    );
  WHEN OTHERS THEN
    RAISE;
END;
$$;


ALTER FUNCTION "public"."submit_mover_application"("p_application" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_rent_payment"("p_invoice_id" "uuid", "p_transaction_reference" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_user uuid:=auth.uid(); v_invoice record; v_submission uuid; v_ref text:=trim(p_transaction_reference); v_landlord_email text;
begin
  if v_user is null then raise exception 'Authentication required'; end if; if length(v_ref)<4 then raise exception 'A valid transaction ID is required'; end if;
  select * into v_invoice from public.rent_invoices where id=p_invoice_id and renter_user_id=v_user for update;
  if not found then raise exception 'Invoice not found or not accessible'; end if; if v_invoice.status not in ('DUE','REJECTED') then raise exception 'Invoice cannot accept a payment submission in status %',v_invoice.status; end if;
  if exists(select 1 from public.rent_payment_submissions where lower(trim(transaction_reference))=lower(v_ref)) then raise exception 'This transaction ID has already been submitted'; end if;
  if exists(select 1 from public.rent_payment_submissions where invoice_id=p_invoice_id and status='PENDING') then raise exception 'This invoice already has a payment awaiting landlord confirmation'; end if;
  insert into public.rent_payment_submissions(invoice_id,renter_user_id,landlord_id,renter_assoc_id,unit_id,transaction_reference,status) values(p_invoice_id,v_user,v_invoice.landlord_id,v_invoice.renter_assoc_id,v_invoice.unit_id,v_ref,'PENDING') returning id into v_submission;
  update public.rent_invoices set status='PAYMENT_SUBMITTED',updated_at=now() where id=p_invoice_id;
  insert into public.user_notifications(user_id,notification_type,title,message,data) values(v_invoice.landlord_id,'RENT_PAYMENT_CONFIRMATION_REQUIRED','Rent payment awaiting confirmation','A renter has submitted a transaction ID for rent. Verify the payment externally and confirm or reject it.',jsonb_build_object('invoice_id',p_invoice_id,'submission_id',v_submission,'transaction_reference',v_ref,'amount_kes',v_invoice.amount_kes));
  select email into v_landlord_email from public.profiles where id=v_invoice.landlord_id;
  if v_landlord_email is not null then insert into public.notification_emails(recipient,subject,html_body,template_type,status) values(v_landlord_email,'Rent payment confirmation required - '||v_invoice.invoice_number,'<p>A renter submitted transaction <strong>'||v_ref||'</strong> for invoice <strong>'||v_invoice.invoice_number||'</strong>.</p><p>Amount: KES '||to_char(v_invoice.amount_kes,'FM999,999,990.00')||'</p><p>Verify the payment in your SakaCrib PMS before confirming.</p>','rent_payment_confirmation_required','pending'); end if;
  return jsonb_build_object('success',true,'submission_id',v_submission,'invoice_id',p_invoice_id,'status','PENDING');
end; $$;


ALTER FUNCTION "public"."submit_rent_payment"("p_invoice_id" "uuid", "p_transaction_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_mover_profile_application_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mover_status text;
  v_is_admin boolean;
BEGIN
  IF NEW.mover_application_status IS NOT DISTINCT FROM OLD.mover_application_status THEN
    RETURN NEW;
  END IF;

  IF NEW.mover_application_status NOT IN ('pending', 'approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  v_is_admin := EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  );

  IF NEW.mover_application_status IN ('approved', 'rejected') AND NOT v_is_admin AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Only an administrator can approve or reject a mover application';
  END IF;

  v_mover_status := CASE NEW.mover_application_status
    WHEN 'pending' THEN 'pending_review'
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
  END;

  PERFORM set_config('app.mover_status_sync', 'true', true);

  UPDATE public.movers
  SET approval_status = v_mover_status,
      updated_at = now()
  WHERE user_id = NEW.id
    AND approval_status IS DISTINCT FROM v_mover_status;

  IF v_is_admin OR current_user = 'postgres' THEN
    UPDATE public.profiles
    SET verification_status = CASE NEW.mover_application_status
          WHEN 'approved' THEN 'verified'
          WHEN 'rejected' THEN 'rejected'
          WHEN 'pending' THEN 'pending_verification'
        END,
        kyc_completed = (NEW.mover_application_status = 'approved'),
        updated_at = now()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_mover_profile_application_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_renter_assoc_rent_from_unit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_unit_rent numeric;
begin
  select rent into v_unit_rent
  from public.property_units
  where id = new.unit_id;

  if v_unit_rent is null then
    raise exception 'Property unit not found or rent is not configured';
  end if;

  new.rent_amount := v_unit_rent;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_renter_assoc_rent_from_unit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_listing_payment_intent_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_listing_payment_intent_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_moving_payment_state"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'HELD' THEN
    IF NEW.paid_at IS NULL THEN
      RAISE EXCEPTION 'Held moving payment must have paid_at';
    END IF;
    IF NEW.released_at IS NOT NULL THEN
      RAISE EXCEPTION 'Held moving payment cannot have released_at';
    END IF;
  END IF;

  IF NEW.status = 'RELEASED' AND NEW.released_at IS NULL THEN
    RAISE EXCEPTION 'Released moving payment must have released_at';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_moving_payment_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_rent_payment_relationship"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_assoc public.renter_unit_associations%rowtype;
  v_unit public.property_units%rowtype;
begin
  select * into v_assoc from public.renter_unit_associations where id = new.renter_assoc_id;
  if not found then raise exception 'Renter association not found'; end if;

  select * into v_unit from public.property_units where id = v_assoc.unit_id;
  if not found then raise exception 'Property unit not found'; end if;

  if new.unit_id <> v_unit.id then
    raise exception 'Payment unit does not match renter association';
  end if;
  if new.landlord_id <> v_assoc.landlord_id or new.landlord_id <> v_unit.user_id then
    raise exception 'Payment landlord does not match unit ownership';
  end if;
  if round(new.amount_kes,2) <> round(v_unit.rent,2) then
    raise exception 'Payment amount must equal the authoritative unit rent';
  end if;
  if new.period_month < 1 or new.period_month > 12 then
    raise exception 'Invalid payment period month';
  end if;
  if new.status = 'PAID' and new.paid_at is null then
    new.paid_at := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_rent_payment_relationship"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_renter_unit_association"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_unit public.property_units%rowtype;
  v_role text;
begin
  select * into v_unit
  from public.property_units
  where id = new.unit_id;

  if not found then
    raise exception 'Property unit not found';
  end if;

  if v_unit.user_id <> new.landlord_id then
    raise exception 'Unit does not belong to the specified landlord';
  end if;

  if new.renter_user_id is not null then
    select role into v_role from public.profiles where id = new.renter_user_id;
    if not found then
      raise exception 'Renter profile not found';
    end if;
    if v_role is not null and lower(v_role) <> 'renter' then
      raise exception 'Associated user must have the renter role';
    end if;
  end if;

  if upper(new.status) = 'ACTIVE' and new.renter_user_id is null then
    raise exception 'An active renter association requires a renter user account';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_renter_unit_association"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_signup_otp"("p_email" "text", "p_otp" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_profile public.profiles%rowtype;
  v_hash text;
  v_email text := lower(trim(p_email));
begin
  perform set_config('app.verification_workflow', 'true', true);

  select * into v_profile
  from public.profiles
  where lower(email) = v_email
  limit 1 for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Invalid verification request');
  end if;

  if v_profile.email_verified then
    return jsonb_build_object('success', true, 'already_verified', true,
      'profile_id', v_profile.id, 'email', v_profile.email,
      'verification_status', v_profile.verification_status);
  end if;

  if v_profile.signup_verification_deadline_at is not null and v_profile.signup_verification_deadline_at <= now() then
    return jsonb_build_object('success', false, 'error', 'Your verification window has expired. Please sign up again.', 'expired', true);
  end if;
  if v_profile.signup_otp_expires_at is null or v_profile.signup_otp_expires_at <= now() then
    return jsonb_build_object('success', false, 'error', 'Verification code has expired');
  end if;
  if v_profile.signup_otp_attempts >= 5 then
    return jsonb_build_object('success', false, 'error', 'Too many verification attempts');
  end if;

  v_hash := encode(digest(trim(p_otp), 'sha256'), 'hex');
  if v_hash <> v_profile.signup_otp_hash then
    update public.profiles set signup_otp_attempts = signup_otp_attempts + 1, updated_at = now() where id = v_profile.id;
    return jsonb_build_object('success', false, 'error', 'Invalid verification code');
  end if;

  update public.profiles
  set email_verified = true,
      signup_otp_verified_at = now(),
      signup_otp_hash = null,
      signup_otp_encrypted = null,
      signup_otp_expires_at = null,
      signup_otp_attempts = 0,
      signup_otp_last_sent_at = null,
      signup_otp_trial_count = 0,
      signup_verification_started_at = null,
      signup_verification_deadline_at = null,
      updated_at = now()
  where id = v_profile.id;

  return jsonb_build_object('success', true, 'profile_id', v_profile.id,
    'email', v_profile.email, 'full_name', v_profile.full_name,
    'email_verified', true,
    'verification_status', v_profile.verification_status);
end;
$$;


ALTER FUNCTION "public"."verify_signup_otp"("p_email" "text", "p_otp" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "text" NOT NULL,
    "renter_id" "uuid" NOT NULL,
    "mover_id" "uuid" NOT NULL,
    "mover_profile_id" "uuid",
    "relocation_date" "date" NOT NULL,
    "day_of_week" "text" NOT NULL,
    "pickup_time" time without time zone NOT NULL,
    "pickup_address" "text" NOT NULL,
    "dropoff_address" "text" NOT NULL,
    "negotiated_price" numeric DEFAULT 0 NOT NULL,
    "commission_amount" numeric DEFAULT 0 NOT NULL,
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_method" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "distance_km" numeric,
    "rate_per_km_kes" numeric,
    "base_rate_kes" numeric
);


ALTER TABLE "public"."booking_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "renter_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "mover_id" "uuid" NOT NULL,
    "listing_id" "uuid",
    "pickup_address" "text" DEFAULT ''::"text" NOT NULL,
    "dropoff_address" "text" DEFAULT ''::"text" NOT NULL,
    "moving_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "booking_amount" numeric DEFAULT 0 NOT NULL,
    "commission_amount" numeric DEFAULT 0 NOT NULL,
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "payment_method" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "distance_km" numeric,
    "rate_per_km_kes" numeric,
    "base_rate_kes" numeric,
    "pickup_latitude" double precision,
    "pickup_longitude" double precision,
    "dropoff_latitude" double precision,
    "dropoff_longitude" double precision,
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "request_expires_at" timestamp with time zone,
    "confirmed_at" timestamp with time zone,
    "scheduled_start_at" timestamp with time zone,
    "scheduled_end_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "cancellation_details" "text",
    "tracking_number" "text",
    "renter_confirmed_delivery_at" timestamp with time zone,
    "contact_released_at" timestamp with time zone,
    "last_known_latitude" double precision,
    "last_known_longitude" double precision,
    "last_location_at" timestamp with time zone,
    "mover_confirmed_delivery_at" timestamp with time zone,
    "dispute_status" "text" DEFAULT 'NONE'::"text" NOT NULL,
    CONSTRAINT "bookings_dispute_status_check" CHECK (("dispute_status" = ANY (ARRAY['NONE'::"text", 'OPEN'::"text", 'RESOLVED'::"text"]))),
    CONSTRAINT "bookings_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'paid'::"text", 'refunded'::"text"]))),
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."bookings" REPLICA IDENTITY FULL;


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "text" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "event_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'image'::"text", 'booking_request'::"text", 'booking_response'::"text", 'schedule_proposed'::"text", 'schedule_confirmed'::"text", 'event_request'::"text", 'event_confirmed'::"text", 'event_declined'::"text", 'system'::"text"])))
);

ALTER TABLE ONLY "public"."chat_messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "listing_id" "uuid",
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "ai_caption" "text" DEFAULT ''::"text",
    "post_type" "text" DEFAULT 'listing'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "community_posts_post_type_check" CHECK (("post_type" = ANY (ARRAY['listing'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."community_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exchange_rate_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "base_currency" "text" NOT NULL,
    "quote_currency" "text" NOT NULL,
    "rate" numeric(18,8) NOT NULL,
    "source" "text" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exchange_rate_cache_currency_check" CHECK (("base_currency" <> "quote_currency")),
    CONSTRAINT "exchange_rate_cache_rate_check" CHECK (("rate" > (0)::numeric))
);


ALTER TABLE "public"."exchange_rate_cache" OWNER TO "postgres";


COMMENT ON TABLE "public"."exchange_rate_cache" IS 'Server-side short-lived FX rate cache. Client access is intentionally disabled.';



CREATE TABLE IF NOT EXISTS "public"."landlord_payment_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "landlord_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "mpesa_method" "text",
    "display_name" "text" NOT NULL,
    "paybill_number" "text",
    "paybill_account" "text",
    "till_number" "text",
    "paypal_email" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "landlord_payment_methods_mpesa_method_check" CHECK ((("mpesa_method" IS NULL) OR ("mpesa_method" = ANY (ARRAY['PAYBILL'::"text", 'TILL'::"text"])))),
    CONSTRAINT "landlord_payment_methods_provider_check" CHECK (("provider" = ANY (ARRAY['MPESA'::"text", 'PAYPAL'::"text"]))),
    CONSTRAINT "landlord_payment_methods_provider_fields_chk" CHECK (((("provider" = 'PAYPAL'::"text") AND ("mpesa_method" IS NULL) AND ("paybill_number" IS NULL) AND ("paybill_account" IS NULL) AND ("till_number" IS NULL) AND ("paypal_email" IS NOT NULL)) OR (("provider" = 'MPESA'::"text") AND ("mpesa_method" = 'PAYBILL'::"text") AND ("paybill_number" IS NOT NULL) AND ("paybill_account" IS NOT NULL) AND ("till_number" IS NULL) AND ("paypal_email" IS NULL)) OR (("provider" = 'MPESA'::"text") AND ("mpesa_method" = 'TILL'::"text") AND ("till_number" IS NOT NULL) AND ("paybill_number" IS NULL) AND ("paybill_account" IS NULL) AND ("paypal_email" IS NULL))))
);


ALTER TABLE "public"."landlord_payment_methods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."landlord_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "landlord_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "billing_cycle" "text" DEFAULT 'MONTHLY'::"text" NOT NULL,
    "status" "text" DEFAULT 'PENDING_PAYMENT'::"text" NOT NULL,
    "current_period_start" timestamp with time zone NOT NULL,
    "current_period_end" timestamp with time zone NOT NULL,
    "grace_period_end" timestamp with time zone,
    "auto_renew" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paypal_subscription_id" "text",
    "paypal_plan_id" "text",
    "paypal_status" "text",
    "next_billing_at" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "cancelled_at" timestamp with time zone,
    "billing_amount_kes" numeric,
    "billing_amount_usd" numeric,
    "billing_exchange_rate" numeric(18,8),
    "billing_exchange_rate_timestamp" timestamp with time zone,
    CONSTRAINT "landlord_billing_amounts_positive" CHECK (((("billing_amount_kes" IS NULL) OR ("billing_amount_kes" > (0)::numeric)) AND (("billing_amount_usd" IS NULL) OR ("billing_amount_usd" > (0)::numeric)))),
    CONSTRAINT "landlord_subscription_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['MONTHLY'::"text", 'ANNUAL'::"text"]))),
    CONSTRAINT "landlord_subscription_grace_check" CHECK ((("grace_period_end" IS NULL) OR ("grace_period_end" > "current_period_end"))),
    CONSTRAINT "landlord_subscription_period_check" CHECK ((("status" = 'PENDING_PAYMENT'::"text") OR ("current_period_end" > "current_period_start"))),
    CONSTRAINT "landlord_subscription_status_check" CHECK (("status" = ANY (ARRAY['PENDING_PAYMENT'::"text", 'ACTIVE'::"text", 'GRACE_PERIOD'::"text", 'EXPIRED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."landlord_subscriptions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."landlord_subscriptions"."paypal_subscription_id" IS 'Provider subscription ID for recurring PayPal billing.';



CREATE TABLE IF NOT EXISTS "public"."listing_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "url" "text" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "media_type" "text" DEFAULT 'photo'::"text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "unit_id" "uuid",
    CONSTRAINT "listing_media_media_type_check" CHECK (("media_type" = ANY (ARRAY['photo'::"text", 'video'::"text"])))
);


ALTER TABLE "public"."listing_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_payment_intents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "amount_kes" numeric DEFAULT 1000.00 NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "listing_data" "jsonb" NOT NULL,
    "provider" "text",
    "provider_reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:15:00'::interval) NOT NULL,
    "listing_id" "uuid",
    "provider_amount" numeric,
    "provider_currency" "text",
    "paypal_order_id" "text",
    "paypal_fx_rate" numeric,
    CONSTRAINT "listing_payment_intents_amount_kes_check" CHECK (("amount_kes" = 1000.00)),
    CONSTRAINT "listing_payment_intents_role_check" CHECK (("role" = ANY (ARRAY['landlord'::"text", 'real_estate'::"text"]))),
    CONSTRAINT "listing_payment_intents_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'PAID'::"text", 'FAILED'::"text", 'CANCELLED'::"text", 'EXPIRED'::"text"])))
);


ALTER TABLE "public"."listing_payment_intents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount_kes" numeric(12,2) DEFAULT 1000.00 NOT NULL,
    "mpesa_receipt" "text",
    "checkout_request_id" "text",
    "merchant_request_id" "text",
    "phone_number" "text",
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "result_code" integer,
    "result_description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "payment_provider" "text",
    "payment_method" "text",
    "provider_reference" "text",
    "provider_amount" numeric,
    "provider_currency" "text",
    "paypal_order_id" "text",
    "paypal_fx_rate" numeric,
    CONSTRAINT "listing_payments_amount_check" CHECK (("amount_kes" > (0)::numeric)),
    CONSTRAINT "listing_payments_amount_fixed_check" CHECK (("amount_kes" = (1000)::numeric)),
    CONSTRAINT "listing_payments_method_check" CHECK ((("payment_method" IS NULL) OR ("payment_method" = ANY (ARRAY['MPESA'::"text", 'PAYPAL'::"text"])))),
    CONSTRAINT "listing_payments_provider_check" CHECK ((("payment_provider" IS NULL) OR ("payment_provider" = ANY (ARRAY['MPESA'::"text", 'PAYPAL'::"text"])))),
    CONSTRAINT "listing_payments_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'PAID'::"text", 'FAILED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."listing_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "city" "text" DEFAULT ''::"text" NOT NULL,
    "county" "text" DEFAULT ''::"text" NOT NULL,
    "price_kes" numeric DEFAULT 0,
    "listing_type" "text" DEFAULT 'rent'::"text" NOT NULL,
    "deposit_required" boolean DEFAULT false,
    "deposit_structure" "text" DEFAULT 'fixed'::"text",
    "deposit_amount" numeric DEFAULT 0,
    "size" "text" DEFAULT ''::"text",
    "beds" integer DEFAULT 0,
    "baths" integer DEFAULT 0,
    "contact_phone" "text" DEFAULT ''::"text",
    "contact_email" "text" DEFAULT ''::"text",
    "social_links" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_paid" boolean DEFAULT false NOT NULL,
    "is_published" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "approval_status" "text" DEFAULT 'pending_review'::"text" NOT NULL,
    "admin_reviewed_at" timestamp with time zone,
    "admin_review_note" "text" DEFAULT ''::"text",
    "is_approved" boolean DEFAULT false NOT NULL,
    "property_name" "text",
    "property_type" "text",
    "location_search" "text",
    "latitude" double precision,
    "longitude" double precision,
    "booking_enabled" boolean DEFAULT false NOT NULL,
    "payment_enabled" boolean DEFAULT false NOT NULL,
    "is_property_management" boolean DEFAULT false NOT NULL,
    "ai_caption" "text",
    "ai_caption_generated_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    CONSTRAINT "listings_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['pending_review'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "listings_deposit_structure_check" CHECK (("deposit_structure" = ANY (ARRAY['fixed'::"text", 'installments'::"text"]))),
    CONSTRAINT "listings_listing_type_check" CHECK (("listing_type" = ANY (ARRAY['rent'::"text", 'sale'::"text"]))),
    CONSTRAINT "listings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'approved'::"text"])))
);


ALTER TABLE "public"."listings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."listings"."admin_review_note" IS 'Optional admin note explaining an approval, rejection, or other review decision. Admin may leave this NULL.';



CREATE TABLE IF NOT EXISTS "public"."mover_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "applicant_id" "uuid" NOT NULL,
    "applicant_email" "text",
    "applicant_name" "text" NOT NULL,
    "application_type" "text" DEFAULT 'mover'::"text" NOT NULL,
    "driver_full_name" "text" NOT NULL,
    "national_id" "text" NOT NULL,
    "dl_number" "text" NOT NULL,
    "dl_photo_url" "text",
    "vehicle_type" "text" NOT NULL,
    "number_plate" "text" NOT NULL,
    "capacity_details" "text" NOT NULL,
    "operating_city" "text" NOT NULL,
    "operating_county" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "base_rate_kes" numeric(12,2) DEFAULT 0,
    "rate_per_km_kes" numeric(12,2) DEFAULT 0,
    "payment_channel" "text" NOT NULL,
    "payment_account" "text" NOT NULL,
    "insurance_policy_details" "text" NOT NULL,
    "vehicle_inspection_expiry" "date" NOT NULL,
    "liability_accepted" boolean DEFAULT false NOT NULL,
    "terms_accepted" boolean DEFAULT false NOT NULL,
    "reference_contacts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_notes" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "location" "text",
    CONSTRAINT "mover_applications_latitude_range" CHECK ((("latitude" IS NULL) OR (("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision)))),
    CONSTRAINT "mover_applications_longitude_range" CHECK ((("longitude" IS NULL) OR (("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision))))
);


ALTER TABLE "public"."mover_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mover_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "mover_id" "uuid" NOT NULL,
    "mover_name" "text" DEFAULT ''::"text" NOT NULL,
    "national_id" "text" DEFAULT ''::"text" NOT NULL,
    "payment_channel" "text" NOT NULL,
    "renter_payment" numeric NOT NULL,
    "platform_deduction" numeric NOT NULL,
    "net_mover_payable" numeric NOT NULL,
    "down_payment_amount" numeric DEFAULT 0 NOT NULL,
    "final_payment_amount" numeric DEFAULT 0 NOT NULL,
    "down_payment_status" "text" DEFAULT 'held'::"text" NOT NULL,
    "final_payment_status" "text" DEFAULT 'held'::"text" NOT NULL,
    "job_started_at" timestamp with time zone,
    "delivery_confirmed_at" timestamp with time zone,
    "down_payment_released_at" timestamp with time zone,
    "final_payment_released_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payout_provider" "text",
    "payout_provider_reference" "text",
    "payout_provider_transaction_id" "text",
    "payout_failure_reason" "text",
    "payout_requested_at" timestamp with time zone,
    "payout_completed_at" timestamp with time zone,
    CONSTRAINT "mover_payouts_down_payment_amount_check" CHECK (("down_payment_amount" >= (0)::numeric)),
    CONSTRAINT "mover_payouts_down_payment_status_check" CHECK (("down_payment_status" = ANY (ARRAY['held'::"text", 'released'::"text"]))),
    CONSTRAINT "mover_payouts_final_payment_amount_check" CHECK (("final_payment_amount" >= (0)::numeric)),
    CONSTRAINT "mover_payouts_final_payment_status_check" CHECK (("final_payment_status" = ANY (ARRAY['held'::"text", 'processing'::"text", 'failed'::"text", 'released'::"text"]))),
    CONSTRAINT "mover_payouts_net_mover_payable_check" CHECK (("net_mover_payable" >= (0)::numeric)),
    CONSTRAINT "mover_payouts_payment_channel_check" CHECK (("payment_channel" = ANY (ARRAY['mpesa_send_money'::"text", 'mpesa_paybill'::"text", 'mpesa_lipa_na_mpesa'::"text", 'airtel_money'::"text"]))),
    CONSTRAINT "mover_payouts_platform_deduction_check" CHECK (("platform_deduction" >= (0)::numeric)),
    CONSTRAINT "mover_payouts_renter_payment_check" CHECK (("renter_payment" >= (0)::numeric))
);


ALTER TABLE "public"."mover_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mover_schedule_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mover_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'CONFIRMED'::"text" NOT NULL,
    "title" "text" DEFAULT 'Moving service'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mover_schedule_events_check" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "mover_schedule_events_status_check" CHECK (("status" = ANY (ARRAY['TENTATIVE'::"text", 'CONFIRMED'::"text", 'CANCELLED'::"text"])))
);

ALTER TABLE ONLY "public"."mover_schedule_events" REPLICA IDENTITY FULL;


ALTER TABLE "public"."mover_schedule_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."movers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "driver_full_name" "text" DEFAULT ''::"text" NOT NULL,
    "national_id" "text" DEFAULT ''::"text" NOT NULL,
    "dl_number" "text" DEFAULT ''::"text" NOT NULL,
    "dl_photo_url" "text" DEFAULT ''::"text",
    "vehicle_type" "text" DEFAULT 'pickup'::"text" NOT NULL,
    "number_plate" "text" DEFAULT ''::"text" NOT NULL,
    "operating_city" "text" DEFAULT ''::"text" NOT NULL,
    "operating_county" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "profile_photo_url" "text" DEFAULT ''::"text",
    "base_rate_kes" numeric DEFAULT 0 NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "business_name" "text" DEFAULT ''::"text",
    "working_days" "text"[] DEFAULT ARRAY['Monday'::"text", 'Tuesday'::"text", 'Wednesday'::"text", 'Thursday'::"text", 'Friday'::"text", 'Saturday'::"text", 'Sunday'::"text"],
    "start_time" time without time zone DEFAULT '08:00:00'::time without time zone,
    "end_time" time without time zone DEFAULT '18:00:00'::time without time zone,
    "payment_channel" "text" DEFAULT 'mpesa_send_money'::"text" NOT NULL,
    "payment_account" "text" DEFAULT ''::"text" NOT NULL,
    "liability_accepted" boolean DEFAULT false NOT NULL,
    "reference_contacts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "approval_status" "text" DEFAULT 'pending_review'::"text" NOT NULL,
    "rate_per_km_kes" numeric DEFAULT 0,
    "insurance_policy_details" "text" DEFAULT ''::"text",
    "vehicle_inspection_expiry" "date",
    "terms_accepted" boolean DEFAULT false,
    "current_latitude" double precision,
    "current_longitude" double precision,
    "location_updated_at" timestamp with time zone,
    "location" "text",
    "capacity_details" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "movers_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['pending_review'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "movers_current_latitude_range" CHECK ((("current_latitude" IS NULL) OR (("current_latitude" >= ('-90'::integer)::double precision) AND ("current_latitude" <= (90)::double precision)))),
    CONSTRAINT "movers_current_longitude_range" CHECK ((("current_longitude" IS NULL) OR (("current_longitude" >= ('-180'::integer)::double precision) AND ("current_longitude" <= (180)::double precision)))),
    CONSTRAINT "movers_payment_channel_check" CHECK (("payment_channel" = ANY (ARRAY['mpesa_send_money'::"text", 'mpesa_paybill'::"text", 'mpesa_lipa_na_mpesa'::"text", 'airtel_money'::"text"]))),
    CONSTRAINT "movers_vehicle_type_check" CHECK (("vehicle_type" = ANY (ARRAY['pickup'::"text", 'lorry'::"text", 'trailer'::"text"])))
);


ALTER TABLE "public"."movers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moving_cancellation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "cancelled_by" "uuid" NOT NULL,
    "reason_code" "text" NOT NULL,
    "reason_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "moving_cancellation_events_reason_code_check" CHECK (("reason_code" = ANY (ARRAY['MOVER_DID_NOT_CONFIRM'::"text", 'MOVER_TAKING_TOO_LONG'::"text", 'CHANGED_MIND'::"text", 'OTHER'::"text", 'RENTER_CANCELLED'::"text", 'MOVER_CANCELLED'::"text", 'MOVER_UNAVAILABLE'::"text"])))
);


ALTER TABLE "public"."moving_cancellation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moving_disputes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "opened_by" "uuid" NOT NULL,
    "reason_code" "text" NOT NULL,
    "description" "text" NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "resolution_code" "text",
    "resolution_notes" "text",
    "resolved_by" "uuid",
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "moving_disputes_description_check" CHECK ((("length"("btrim"("description")) >= 1) AND ("length"("btrim"("description")) <= 5000))),
    CONSTRAINT "moving_disputes_resolution_check" CHECK ((("resolution_code" IS NULL) OR ("resolution_code" = ANY (ARRAY['RELEASE_TO_MOVER'::"text", 'REFUND_RENTER'::"text", 'PARTIAL_REFUND'::"text", 'NO_REFUND'::"text"])))),
    CONSTRAINT "moving_disputes_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'RESOLVED'::"text"])))
);


ALTER TABLE "public"."moving_disputes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moving_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "renter_id" "uuid" NOT NULL,
    "mover_id" "uuid" NOT NULL,
    "amount_kes" numeric(12,2) NOT NULL,
    "platform_fee_kes" numeric(12,2) DEFAULT 0 NOT NULL,
    "mover_net_kes" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'KES'::"text" NOT NULL,
    "status" "text" DEFAULT 'ISSUED'::"text" NOT NULL,
    "payment_provider" "text",
    "provider_reference" "text",
    "provider_transaction_id" "text",
    "paid_at" timestamp with time zone,
    "released_at" timestamp with time zone,
    "mover_name_snapshot" "text" DEFAULT ''::"text" NOT NULL,
    "mover_phone_snapshot" "text",
    "vehicle_type_snapshot" "text",
    "number_plate_snapshot" "text",
    "mover_profile_photo_snapshot" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "moving_invoices_amount_kes_check" CHECK (("amount_kes" >= (0)::numeric)),
    CONSTRAINT "moving_invoices_currency_check" CHECK (("currency" = 'KES'::"text")),
    CONSTRAINT "moving_invoices_mover_net_kes_check" CHECK (("mover_net_kes" >= (0)::numeric)),
    CONSTRAINT "moving_invoices_payment_provider_check" CHECK ((("payment_provider" IS NULL) OR ("payment_provider" = ANY (ARRAY['MPESA'::"text", 'PAYPAL'::"text"])))),
    CONSTRAINT "moving_invoices_platform_fee_kes_check" CHECK (("platform_fee_kes" >= (0)::numeric)),
    CONSTRAINT "moving_invoices_status_check" CHECK (("status" = ANY (ARRAY['ISSUED'::"text", 'PAID'::"text", 'HELD'::"text", 'RELEASED'::"text", 'REFUNDED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."moving_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moving_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "payer_id" "uuid" NOT NULL,
    "amount_kes" numeric(12,2) NOT NULL,
    "provider" "text" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "provider_reference" "text",
    "provider_transaction_id" "text",
    "mpesa_receipt" "text",
    "paypal_order_id" "text",
    "provider_amount" numeric(12,2),
    "provider_currency" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "released_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "moving_payments_amount_kes_check" CHECK (("amount_kes" > (0)::numeric)),
    CONSTRAINT "moving_payments_provider_check" CHECK (("provider" = ANY (ARRAY['MPESA'::"text", 'PAYPAL'::"text"]))),
    CONSTRAINT "moving_payments_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'PROCESSING'::"text", 'PAID'::"text", 'HELD'::"text", 'RELEASED'::"text", 'FAILED'::"text", 'REFUNDED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."moving_payments" OWNER TO "postgres";


ALTER TABLE "public"."moving_tracking_points" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."moving_tracking_points_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."notification_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "html_body" "text" NOT NULL,
    "template_type" "text" DEFAULT 'generic'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sent_at" timestamp with time zone
);


ALTER TABLE "public"."notification_emails" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_emails" IS 'Server-controlled outbound email queue. Browser clients have no direct access.';



CREATE TABLE IF NOT EXISTS "public"."payment_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "status" "text" DEFAULT 'RECEIVED'::"text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "error" "text",
    "invoice_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "payment_webhook_events_status_check" CHECK (("status" = ANY (ARRAY['RECEIVED'::"text", 'PROCESSING'::"text", 'PROCESSED'::"text", 'IGNORED'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "public"."payment_webhook_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_webhook_events" IS 'Server-controlled payment webhook ledger. Browser clients have no direct access.';



COMMENT ON COLUMN "public"."payment_webhook_events"."event_id" IS 'Provider event identifier; unique per provider to make webhook processing idempotent.';



CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "mover_commission_rate" numeric(8,6) DEFAULT 0.100000 NOT NULL,
    "mover_operational_markup_rate" numeric(8,6) DEFAULT 0.000000 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "platform_settings_id_check" CHECK (("id" = true)),
    CONSTRAINT "platform_settings_mover_commission_rate_check" CHECK ((("mover_commission_rate" >= (0)::numeric) AND ("mover_commission_rate" <= (1)::numeric))),
    CONSTRAINT "platform_settings_mover_operational_markup_rate_check" CHECK ((("mover_operational_markup_rate" >= (0)::numeric) AND ("mover_operational_markup_rate" <= (1)::numeric)))
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pms_subscription_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "landlord_id" "uuid" NOT NULL,
    "subscription_id" "uuid",
    "notification_type" "text" NOT NULL,
    "unit_count" integer NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "action_type" "text",
    "action_required" boolean DEFAULT false NOT NULL,
    "email_sent" boolean DEFAULT false NOT NULL,
    "in_app_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    CONSTRAINT "pms_notification_action_check" CHECK ((("action_type" IS NULL) OR ("action_type" = ANY (ARRAY['VIEW_PMS'::"text", 'UPGRADE'::"text", 'RENEW'::"text", 'VIEW_SUBSCRIPTION'::"text"])))),
    CONSTRAINT "pms_notification_type_check" CHECK (("notification_type" = ANY (ARRAY['PMS_STARTED'::"text", 'GROWTH_5'::"text", 'GROWTH_15'::"text", 'GROWTH_17'::"text", 'GROWTH_19'::"text", 'GROWTH_LIMIT'::"text", 'PROGRESS_35'::"text", 'PROGRESS_38'::"text", 'PROGRESS_39'::"text", 'GROWTH_TO_PRO'::"text", 'PRO_UNLIMITED'::"text", 'SUBSCRIPTION_EXPIRING'::"text", 'GRACE_PERIOD_STARTED'::"text", 'GRACE_PERIOD_REMINDER'::"text", 'SUBSCRIPTION_EXPIRED'::"text", 'SUBSCRIPTION_RENEWED'::"text"]))),
    CONSTRAINT "pms_notification_unit_count_check" CHECK (("unit_count" >= 0))
);


ALTER TABLE "public"."pms_subscription_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."property_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "unit_number" "text" NOT NULL,
    "unit_type" "text" NOT NULL,
    "rent" numeric NOT NULL,
    "deposit_amount" numeric DEFAULT 0 NOT NULL,
    "size" "text",
    "beds" integer DEFAULT 1 NOT NULL,
    "baths" integer DEFAULT 1 NOT NULL,
    "availability" "text" DEFAULT 'available'::"text" NOT NULL,
    "description" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_tracking_enabled" boolean DEFAULT true NOT NULL,
    "rent_due_day" smallint DEFAULT 1 NOT NULL,
    "rent_paid_in_advance" boolean DEFAULT false NOT NULL,
    "rent_paid_through_month" "date",
    CONSTRAINT "property_units_availability_check" CHECK (("availability" = ANY (ARRAY['available'::"text", 'occupied'::"text", 'reserved'::"text"]))),
    CONSTRAINT "property_units_rent_due_day_check" CHECK ((("rent_due_day" >= 1) AND ("rent_due_day" <= 28))),
    CONSTRAINT "property_units_rent_paid_through_month_check" CHECK ((("rent_paid_through_month" IS NULL) OR ("rent_paid_through_month" = ("date_trunc"('month'::"text", ("rent_paid_through_month")::timestamp with time zone))::"date")))
);


ALTER TABLE "public"."property_units" OWNER TO "postgres";


COMMENT ON COLUMN "public"."property_units"."payment_tracking_enabled" IS 'Whether PMS rent tracking and payment reminders are enabled for this unit.';



COMMENT ON COLUMN "public"."property_units"."rent_due_day" IS 'Configured monthly rent due day, restricted to 1-28.';



CREATE TABLE IF NOT EXISTS "public"."real_estate_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "real_estate_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "billing_cycle" "text" DEFAULT 'MONTHLY'::"text" NOT NULL,
    "status" "text" DEFAULT 'PENDING_PAYMENT'::"text" NOT NULL,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "grace_period_end" timestamp with time zone,
    "auto_renew" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paypal_subscription_id" "text",
    "paypal_plan_id" "text",
    "paypal_status" "text",
    "next_billing_at" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "cancelled_at" timestamp with time zone,
    "billing_amount_kes" numeric,
    "billing_amount_usd" numeric,
    "billing_exchange_rate" numeric(18,8),
    "billing_exchange_rate_timestamp" timestamp with time zone,
    CONSTRAINT "real_estate_billing_amounts_positive" CHECK (((("billing_amount_kes" IS NULL) OR ("billing_amount_kes" > (0)::numeric)) AND (("billing_amount_usd" IS NULL) OR ("billing_amount_usd" > (0)::numeric)))),
    CONSTRAINT "real_estate_subscription_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['MONTHLY'::"text", 'ANNUAL'::"text"]))),
    CONSTRAINT "real_estate_subscription_status_check" CHECK (("status" = ANY (ARRAY['PENDING_PAYMENT'::"text", 'ACTIVE'::"text", 'GRACE_PERIOD'::"text", 'EXPIRED'::"text", 'CANCELLED'::"text", 'PAST_DUE'::"text"])))
);


ALTER TABLE "public"."real_estate_subscriptions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."real_estate_subscriptions"."paypal_subscription_id" IS 'Provider subscription ID for recurring PayPal billing.';



CREATE TABLE IF NOT EXISTS "public"."rent_invoice_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "renter_assoc_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "period_year" integer NOT NULL,
    "period_month" integer NOT NULL,
    "amount_kes" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rent_invoice_periods_amount_kes_check" CHECK (("amount_kes" > (0)::numeric)),
    CONSTRAINT "rent_invoice_periods_period_month_check" CHECK ((("period_month" >= 1) AND ("period_month" <= 12))),
    CONSTRAINT "rent_invoice_periods_period_year_check" CHECK ((("period_year" >= 2000) AND ("period_year" <= 2200)))
);


ALTER TABLE "public"."rent_invoice_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rent_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_number" "text" NOT NULL,
    "landlord_id" "uuid" NOT NULL,
    "renter_user_id" "uuid" NOT NULL,
    "renter_assoc_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "billing_period_start" "date" NOT NULL,
    "billing_period_end" "date" NOT NULL,
    "due_date" "date" NOT NULL,
    "amount_kes" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'KES'::"text" NOT NULL,
    "status" "text" DEFAULT 'DUE'::"text" NOT NULL,
    "payment_method_id" "uuid",
    "payment_destination_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "paid_at" timestamp with time zone,
    "confirmed_by" "uuid",
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rent_invoices_amount_kes_check" CHECK (("amount_kes" > (0)::numeric)),
    CONSTRAINT "rent_invoices_check" CHECK (("billing_period_end" >= "billing_period_start")),
    CONSTRAINT "rent_invoices_check1" CHECK (((("status" = 'PAID'::"text") AND ("paid_at" IS NOT NULL) AND ("confirmed_at" IS NOT NULL) AND ("confirmed_by" IS NOT NULL)) OR ("status" <> 'PAID'::"text"))),
    CONSTRAINT "rent_invoices_currency_check" CHECK (("currency" = 'KES'::"text")),
    CONSTRAINT "rent_invoices_status_check" CHECK (("status" = ANY (ARRAY['DUE'::"text", 'PAYMENT_SUBMITTED'::"text", 'PAID'::"text", 'REJECTED'::"text", 'CANCELLED'::"text", 'OVERDUE'::"text"])))
);


ALTER TABLE "public"."rent_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rent_payment_intents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "renter_user_id" "uuid" NOT NULL,
    "renter_assoc_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "landlord_id" "uuid" NOT NULL,
    "payment_periods" "jsonb" NOT NULL,
    "amount_kes" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "provider" "text",
    "payment_method" "text",
    "provider_reference" "text",
    "provider_amount" numeric(12,2),
    "provider_currency" "text",
    "paypal_order_id" "text",
    "paypal_fx_rate" numeric(18,8),
    "mpesa_receipt" "text",
    "checkout_request_id" "text",
    "merchant_request_id" "text",
    "phone_number" "text",
    "result_code" integer,
    "result_description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:30:00'::interval) NOT NULL,
    "payment_method_id" "uuid",
    "payment_destination_snapshot" "jsonb",
    CONSTRAINT "rent_payment_intents_amount_kes_check" CHECK (("amount_kes" > (0)::numeric)),
    CONSTRAINT "rent_payment_intents_payment_method_check" CHECK ((("payment_method" IS NULL) OR ("payment_method" = ANY (ARRAY['MPESA'::"text", 'PAYPAL'::"text"])))),
    CONSTRAINT "rent_payment_intents_provider_check" CHECK ((("provider" IS NULL) OR ("provider" = ANY (ARRAY['MPESA'::"text", 'PAYPAL'::"text"])))),
    CONSTRAINT "rent_payment_intents_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'PROCESSING'::"text", 'PAID'::"text", 'FAILED'::"text", 'EXPIRED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."rent_payment_intents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rent_payment_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "renter_user_id" "uuid" NOT NULL,
    "landlord_id" "uuid" NOT NULL,
    "renter_assoc_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "transaction_reference" "text" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_by" "uuid",
    "confirmed_at" timestamp with time zone,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rent_payment_submissions_check" CHECK (((("status" = 'CONFIRMED'::"text") AND ("confirmed_by" IS NOT NULL) AND ("confirmed_at" IS NOT NULL)) OR ("status" <> 'CONFIRMED'::"text"))),
    CONSTRAINT "rent_payment_submissions_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'CONFIRMED'::"text", 'REJECTED'::"text"]))),
    CONSTRAINT "rent_payment_submissions_transaction_reference_check" CHECK (("length"(TRIM(BOTH FROM "transaction_reference")) >= 4))
);


ALTER TABLE "public"."rent_payment_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rent_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "renter_assoc_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "landlord_id" "uuid" NOT NULL,
    "amount_kes" numeric NOT NULL,
    "period_year" integer NOT NULL,
    "period_month" integer NOT NULL,
    "status" "text" DEFAULT 'UNPAID'::"text" NOT NULL,
    "mpesa_receipt" "text",
    "checkout_request_id" "text",
    "paid_at" timestamp with time zone,
    "payment_provider" "text" DEFAULT 'MPESA'::"text",
    "payment_method" "text" DEFAULT 'MPESA'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_intent_id" "uuid",
    "provider_reference" "text",
    "provider_amount" numeric(12,2),
    "provider_currency" "text",
    "paypal_order_id" "text",
    "paypal_fx_rate" numeric(18,8),
    "merchant_request_id" "text",
    "phone_number" "text",
    "result_code" integer,
    "result_description" "text",
    "payment_method_id" "uuid",
    "payment_destination_snapshot" "jsonb",
    CONSTRAINT "rent_payments_method_check" CHECK ((("payment_method" IS NULL) OR ("upper"("payment_method") = ANY (ARRAY['MPESA'::"text", 'PAYPAL'::"text", 'MANUAL'::"text"])))),
    CONSTRAINT "rent_payments_period_month_check" CHECK ((("period_month" >= 1) AND ("period_month" <= 12))),
    CONSTRAINT "rent_payments_provider_check" CHECK ((("payment_provider" IS NULL) OR ("upper"("payment_provider") = ANY (ARRAY['MPESA'::"text", 'PAYPAL'::"text", 'MANUAL'::"text"])))),
    CONSTRAINT "rent_payments_status_check" CHECK (("upper"("status") = ANY (ARRAY['UNPAID'::"text", 'PENDING'::"text", 'PAID'::"text", 'FAILED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."rent_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rent_reminder_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "renter_assoc_id" "uuid" NOT NULL,
    "landlord_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "recurring" boolean DEFAULT true NOT NULL,
    "offsets_days" integer[] DEFAULT ARRAY[7, 3, 1, 0, '-1'::integer] NOT NULL,
    "channels" "text"[] DEFAULT ARRAY['IN_APP'::"text"] NOT NULL,
    "custom_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rent_reminder_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rent_reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "renter_assoc_id" "uuid" NOT NULL,
    "landlord_id" "uuid" NOT NULL,
    "payment_period_year" integer NOT NULL,
    "payment_period_month" integer NOT NULL,
    "due_date" "date" NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "offset_days" integer NOT NULL,
    "channel" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "failure_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rent_reminders_payment_period_month_check" CHECK ((("payment_period_month" >= 1) AND ("payment_period_month" <= 12))),
    CONSTRAINT "rent_reminders_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'SENT'::"text", 'DELIVERED'::"text", 'FAILED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."rent_reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."renter_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "renter_user_id" "uuid" NOT NULL,
    "renter_assoc_id" "uuid",
    "landlord_id" "uuid",
    "notification_type" "text" DEFAULT 'RENT_REMINDER'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "action_type" "text",
    "action_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."renter_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reviewer_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "reviewee_id" "uuid",
    "listing_id" "uuid",
    "mover_id" "uuid",
    "rating" integer DEFAULT 5 NOT NULL,
    "comment" "text" DEFAULT ''::"text" NOT NULL,
    "review_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "booking_id" "uuid",
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "reviews_review_type_check" CHECK (("review_type" = ANY (ARRAY['landlord'::"text", 'mover'::"text"])))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "amount_kes" numeric(12,2) NOT NULL,
    "mpesa_receipt" "text",
    "checkout_request_id" "text",
    "merchant_request_id" "text",
    "phone_number" "text",
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "result_code" integer,
    "result_description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "payment_provider" "text" DEFAULT 'MPESA'::"text" NOT NULL,
    "provider_reference" "text",
    "provider_transaction_id" "text",
    "payment_method" "text",
    "landlord_subscription_id" "uuid",
    "real_estate_subscription_id" "uuid",
    "currency" "text",
    "amount_usd" numeric(12,2),
    "exchange_rate" numeric(18,8),
    "exchange_rate_source" "text",
    "exchange_rate_timestamp" timestamp with time zone,
    "paypal_subscription_id" "text",
    "billing_period_start" timestamp with time zone,
    "billing_period_end" timestamp with time zone,
    "webhook_event_id" "text",
    "pricing_snapshot_source" "text",
    CONSTRAINT "subscription_invoice_amount_check" CHECK (("amount_kes" > (0)::numeric)),
    CONSTRAINT "subscription_invoice_exactly_one_subscription_check" CHECK ((((("landlord_subscription_id" IS NOT NULL))::integer + (("real_estate_subscription_id" IS NOT NULL))::integer) = 1)),
    CONSTRAINT "subscription_invoice_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'PAID'::"text", 'FAILED'::"text"]))),
    CONSTRAINT "subscription_invoices_currency_check" CHECK ((("currency" IS NULL) OR ("currency" = 'USD'::"text"))),
    CONSTRAINT "subscription_invoices_fx_rate_check" CHECK ((("payment_provider" <> 'PAYPAL'::"text") OR (("currency" = 'USD'::"text") AND ("amount_usd" IS NOT NULL) AND ("amount_usd" > (0)::numeric) AND ("exchange_rate" IS NOT NULL) AND ("exchange_rate" > (0)::numeric) AND ("exchange_rate_source" IS NOT NULL) AND ("exchange_rate_timestamp" IS NOT NULL)))),
    CONSTRAINT "subscription_invoices_payment_provider_check" CHECK (("payment_provider" = ANY (ARRAY['MPESA'::"text", 'PAYPAL'::"text"])))
);


ALTER TABLE "public"."subscription_invoices" OWNER TO "postgres";


COMMENT ON COLUMN "public"."subscription_invoices"."exchange_rate" IS 'Locked USD/KES rate used to calculate amount_usd for this invoice.';



COMMENT ON COLUMN "public"."subscription_invoices"."exchange_rate_source" IS 'FX provider/source used for the locked rate.';



COMMENT ON COLUMN "public"."subscription_invoices"."exchange_rate_timestamp" IS 'Timestamp at which the locked FX rate was retrieved.';



COMMENT ON COLUMN "public"."subscription_invoices"."paypal_subscription_id" IS 'PayPal recurring subscription that generated this invoice, when applicable.';



CREATE TABLE IF NOT EXISTS "public"."subscription_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "activated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deactivated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "real_estate_subscription_id" "uuid",
    CONSTRAINT "subscription_listing_dates_check" CHECK ((("deactivated_at" IS NULL) OR ("deactivated_at" >= "activated_at"))),
    CONSTRAINT "subscription_listing_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'INACTIVE'::"text"]))),
    CONSTRAINT "subscription_listings_exactly_one_subscription_check" CHECK (((("subscription_id" IS NOT NULL) AND ("real_estate_subscription_id" IS NULL)) OR (("subscription_id" IS NULL) AND ("real_estate_subscription_id" IS NOT NULL))))
);


ALTER TABLE "public"."subscription_listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "max_units_per_listing" integer,
    "monthly_price_kes" numeric(12,2) NOT NULL,
    "annual_price_kes" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "max_listings" integer,
    "audience" "text" DEFAULT 'LANDLORD'::"text" NOT NULL,
    "paypal_product_id" "text",
    "paypal_monthly_plan_id" "text",
    "paypal_annual_plan_id" "text",
    "paypal_monthly_price_usd" numeric(12,2),
    "paypal_annual_price_usd" numeric(12,2),
    "paypal_fx_rate" numeric(18,8),
    "paypal_fx_rate_timestamp" timestamp with time zone,
    CONSTRAINT "subscription_plan_annual_price_check" CHECK (("annual_price_kes" >= (0)::numeric)),
    CONSTRAINT "subscription_plan_monthly_price_check" CHECK (("monthly_price_kes" >= (0)::numeric)),
    CONSTRAINT "subscription_plan_name_check" CHECK (("name" = ANY (ARRAY['STARTER'::"text", 'GROWTH'::"text", 'PRO'::"text", 'ENTERPRISE'::"text"]))),
    CONSTRAINT "subscription_plan_units_check" CHECK ((("max_units_per_listing" IS NULL) OR ("max_units_per_listing" > 0))),
    CONSTRAINT "subscription_plans_audience_check" CHECK (("audience" = ANY (ARRAY['LANDLORD'::"text", 'REAL_ESTATE'::"text"])))
);


ALTER TABLE "public"."subscription_plans" OWNER TO "postgres";


COMMENT ON COLUMN "public"."subscription_plans"."paypal_product_id" IS 'PayPal Product ID for recurring subscription billing.';



COMMENT ON COLUMN "public"."subscription_plans"."paypal_monthly_plan_id" IS 'PayPal recurring monthly plan ID.';



COMMENT ON COLUMN "public"."subscription_plans"."paypal_annual_plan_id" IS 'PayPal recurring annual plan ID.';



COMMENT ON COLUMN "public"."subscription_plans"."paypal_monthly_price_usd" IS 'USD price locked into the current PayPal monthly plan.';



COMMENT ON COLUMN "public"."subscription_plans"."paypal_annual_price_usd" IS 'USD price locked into the current PayPal annual plan.';



COMMENT ON COLUMN "public"."subscription_plans"."paypal_fx_rate" IS 'USD/KES rate used when the current PayPal plan prices were created.';



CREATE TABLE IF NOT EXISTS "public"."subscription_renewal_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "attempt_day" integer NOT NULL,
    "checkout_request_id" "text",
    "status" "text" DEFAULT 'INITIATED'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "real_estate_subscription_id" "uuid",
    "payment_provider" "text",
    "provider_reference" "text",
    "provider_transaction_id" "text",
    "failure_reason" "text",
    "completed_at" timestamp with time zone,
    CONSTRAINT "renewal_attempt_day_check" CHECK (("attempt_day" = ANY (ARRAY[1, 4]))),
    CONSTRAINT "renewal_attempt_status_check" CHECK (("status" = ANY (ARRAY['INITIATED'::"text", 'SENT'::"text", 'FAILED'::"text", 'PAID'::"text"]))),
    CONSTRAINT "subscription_renewal_attempts_owner_check" CHECK ((("subscription_id" IS NOT NULL) <> ("real_estate_subscription_id" IS NOT NULL)))
);


ALTER TABLE "public"."subscription_renewal_attempts" OWNER TO "postgres";


COMMENT ON TABLE "public"."subscription_renewal_attempts" IS 'Server-controlled renewal ledger. Browser clients have no direct access.';



CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "admin_reply" "text" DEFAULT ''::"text" NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "support_tickets_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."support_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."terms_acceptance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "context" "text" NOT NULL,
    "accepted" boolean DEFAULT false NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "terms_acceptance_context_check" CHECK (("context" = ANY (ARRAY['landlord'::"text", 'mover'::"text", 'listing'::"text"])))
);


ALTER TABLE "public"."terms_acceptance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_key" "text"
);


ALTER TABLE "public"."user_notifications" OWNER TO "postgres";


ALTER TABLE ONLY "public"."booking_events"
    ADD CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exchange_rate_cache"
    ADD CONSTRAINT "exchange_rate_cache_pair_key" UNIQUE ("base_currency", "quote_currency");



ALTER TABLE ONLY "public"."exchange_rate_cache"
    ADD CONSTRAINT "exchange_rate_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."landlord_payment_methods"
    ADD CONSTRAINT "landlord_payment_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."landlord_subscriptions"
    ADD CONSTRAINT "landlord_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_media"
    ADD CONSTRAINT "listing_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_payment_intents"
    ADD CONSTRAINT "listing_payment_intents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_payments"
    ADD CONSTRAINT "listing_payments_checkout_request_id_key" UNIQUE ("checkout_request_id");



ALTER TABLE ONLY "public"."listing_payments"
    ADD CONSTRAINT "listing_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_payments"
    ADD CONSTRAINT "listing_payments_provider_reference_key" UNIQUE ("provider_reference");



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mover_applications"
    ADD CONSTRAINT "mover_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mover_payouts"
    ADD CONSTRAINT "mover_payouts_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."mover_payouts"
    ADD CONSTRAINT "mover_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mover_schedule_events"
    ADD CONSTRAINT "mover_schedule_events_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."mover_schedule_events"
    ADD CONSTRAINT "mover_schedule_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movers"
    ADD CONSTRAINT "movers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movers"
    ADD CONSTRAINT "movers_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."moving_cancellation_events"
    ADD CONSTRAINT "moving_cancellation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moving_disputes"
    ADD CONSTRAINT "moving_disputes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moving_invoices"
    ADD CONSTRAINT "moving_invoices_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."moving_invoices"
    ADD CONSTRAINT "moving_invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."moving_invoices"
    ADD CONSTRAINT "moving_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moving_payments"
    ADD CONSTRAINT "moving_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moving_tracking_points"
    ADD CONSTRAINT "moving_tracking_points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_emails"
    ADD CONSTRAINT "notification_emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_provider_event_id_key" UNIQUE ("provider", "event_id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pms_subscription_notifications"
    ADD CONSTRAINT "pms_subscription_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."property_units"
    ADD CONSTRAINT "property_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."real_estate_subscriptions"
    ADD CONSTRAINT "real_estate_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rent_invoice_periods"
    ADD CONSTRAINT "rent_invoice_periods_invoice_id_period_year_period_month_key" UNIQUE ("invoice_id", "period_year", "period_month");



ALTER TABLE ONLY "public"."rent_invoice_periods"
    ADD CONSTRAINT "rent_invoice_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rent_invoices"
    ADD CONSTRAINT "rent_invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."rent_invoices"
    ADD CONSTRAINT "rent_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rent_payment_intents"
    ADD CONSTRAINT "rent_payment_intents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rent_payment_submissions"
    ADD CONSTRAINT "rent_payment_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rent_payments"
    ADD CONSTRAINT "rent_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rent_payments"
    ADD CONSTRAINT "rent_payments_renter_assoc_id_period_year_period_month_key" UNIQUE ("renter_assoc_id", "period_year", "period_month");



ALTER TABLE ONLY "public"."rent_reminder_settings"
    ADD CONSTRAINT "rent_reminder_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rent_reminder_settings"
    ADD CONSTRAINT "rent_reminder_settings_renter_assoc_id_key" UNIQUE ("renter_assoc_id");



ALTER TABLE ONLY "public"."rent_reminders"
    ADD CONSTRAINT "rent_reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rent_reminders"
    ADD CONSTRAINT "rent_reminders_renter_assoc_id_payment_period_year_payment__key" UNIQUE ("renter_assoc_id", "payment_period_year", "payment_period_month", "offset_days", "channel");



ALTER TABLE ONLY "public"."renter_notifications"
    ADD CONSTRAINT "renter_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."renter_unit_associations"
    ADD CONSTRAINT "renter_unit_associations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_invoices"
    ADD CONSTRAINT "subscription_invoices_checkout_request_id_key" UNIQUE ("checkout_request_id");



ALTER TABLE ONLY "public"."subscription_invoices"
    ADD CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_listings"
    ADD CONSTRAINT "subscription_listing_unique" UNIQUE ("subscription_id", "listing_id");



ALTER TABLE ONLY "public"."subscription_listings"
    ADD CONSTRAINT "subscription_listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_renewal_attempts"
    ADD CONSTRAINT "subscription_renewal_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."terms_acceptance"
    ADD CONSTRAINT "terms_acceptance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_renewal_attempts"
    ADD CONSTRAINT "unique_subscription_renewal_day" UNIQUE ("subscription_id", "attempt_day");



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id");



CREATE INDEX "booking_events_conversation_created_idx" ON "public"."booking_events" USING "btree" ("conversation_id", "created_at" DESC);



CREATE INDEX "bookings_listing_id_idx" ON "public"."bookings" USING "btree" ("listing_id");



CREATE INDEX "bookings_mover_status_idx" ON "public"."bookings" USING "btree" ("mover_id", "status", "payment_status");



CREATE INDEX "bookings_renter_status_idx" ON "public"."bookings" USING "btree" ("renter_id", "status", "created_at" DESC);



CREATE INDEX "bookings_scheduled_start_idx" ON "public"."bookings" USING "btree" ("mover_id", "scheduled_start_at") WHERE ("scheduled_start_at" IS NOT NULL);



CREATE UNIQUE INDEX "bookings_tracking_number_uidx" ON "public"."bookings" USING "btree" ("tracking_number") WHERE ("tracking_number" IS NOT NULL);



CREATE INDEX "chat_messages_conversation_created_desc_idx" ON "public"."chat_messages" USING "btree" ("conversation_id", "created_at" DESC);



CREATE INDEX "chat_messages_conversation_created_idx" ON "public"."chat_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "chat_messages_receiver_id_idx" ON "public"."chat_messages" USING "btree" ("receiver_id");



CREATE INDEX "chat_messages_sender_id_idx" ON "public"."chat_messages" USING "btree" ("sender_id");



CREATE INDEX "chat_messages_sender_receiver_idx" ON "public"."chat_messages" USING "btree" ("sender_id", "receiver_id");



CREATE INDEX "exchange_rate_cache_pair_fetched_idx" ON "public"."exchange_rate_cache" USING "btree" ("base_currency", "quote_currency", "fetched_at" DESC);



CREATE INDEX "idx_booking_events_conversation" ON "public"."booking_events" USING "btree" ("conversation_id");



CREATE INDEX "idx_booking_events_mover" ON "public"."booking_events" USING "btree" ("mover_id");



CREATE INDEX "idx_booking_events_renter" ON "public"."booking_events" USING "btree" ("renter_id");



CREATE INDEX "idx_bookings_mover_id" ON "public"."bookings" USING "btree" ("mover_id");



CREATE INDEX "idx_bookings_mover_status" ON "public"."bookings" USING "btree" ("mover_id", "status");



CREATE INDEX "idx_bookings_renter_id" ON "public"."bookings" USING "btree" ("renter_id");



CREATE INDEX "idx_bookings_renter_status" ON "public"."bookings" USING "btree" ("renter_id", "status");



CREATE INDEX "idx_chat_messages_conversation" ON "public"."chat_messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_chat_messages_created" ON "public"."chat_messages" USING "btree" ("created_at");



CREATE INDEX "idx_community_posts_created_at" ON "public"."community_posts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_landlord_subscriptions_grace_end" ON "public"."landlord_subscriptions" USING "btree" ("grace_period_end");



CREATE INDEX "idx_landlord_subscriptions_landlord" ON "public"."landlord_subscriptions" USING "btree" ("landlord_id");



CREATE INDEX "idx_landlord_subscriptions_period_end" ON "public"."landlord_subscriptions" USING "btree" ("current_period_end");



CREATE INDEX "idx_landlord_subscriptions_status" ON "public"."landlord_subscriptions" USING "btree" ("status");



CREATE INDEX "idx_landlord_subscriptions_status_period" ON "public"."landlord_subscriptions" USING "btree" ("status", "current_period_end");



CREATE INDEX "idx_listing_media_listing_id" ON "public"."listing_media" USING "btree" ("listing_id");



CREATE INDEX "idx_listing_payment_intents_listing_id" ON "public"."listing_payment_intents" USING "btree" ("listing_id");



CREATE INDEX "idx_listings_city" ON "public"."listings" USING "btree" ("city");



CREATE INDEX "idx_listings_created_at" ON "public"."listings" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_listings_user_id" ON "public"."listings" USING "btree" ("user_id");



CREATE INDEX "idx_mover_payouts_status" ON "public"."mover_payouts" USING "btree" ("down_payment_status", "final_payment_status");



CREATE INDEX "idx_movers_city" ON "public"."movers" USING "btree" ("operating_city");



CREATE INDEX "idx_movers_user_id" ON "public"."movers" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_signup_verification_cleanup" ON "public"."profiles" USING "btree" ("signup_verification_deadline_at") WHERE (("email_verified" = false) AND ("signup_verification_deadline_at" IS NOT NULL));



CREATE INDEX "idx_rent_payments_landlord_id" ON "public"."rent_payments" USING "btree" ("landlord_id");



CREATE INDEX "idx_rent_payments_status" ON "public"."rent_payments" USING "btree" ("status");



CREATE INDEX "idx_rent_payments_unit_id" ON "public"."rent_payments" USING "btree" ("unit_id");



CREATE INDEX "idx_rent_reminders_due_schedule" ON "public"."rent_reminders" USING "btree" ("scheduled_for", "status");



CREATE INDEX "idx_renter_assoc_landlord_id" ON "public"."renter_unit_associations" USING "btree" ("landlord_id");



CREATE INDEX "idx_renter_assoc_unit_id" ON "public"."renter_unit_associations" USING "btree" ("unit_id");



CREATE INDEX "idx_renter_notifications_user_created" ON "public"."renter_notifications" USING "btree" ("renter_user_id", "created_at" DESC);



CREATE INDEX "idx_renter_unit_associations_renter_user_id" ON "public"."renter_unit_associations" USING "btree" ("renter_user_id");



CREATE INDEX "idx_renter_unit_associations_unit_status" ON "public"."renter_unit_associations" USING "btree" ("unit_id", "status");



CREATE INDEX "idx_reviews_mover_id" ON "public"."reviews" USING "btree" ("mover_id");



CREATE INDEX "idx_reviews_reviewee_id" ON "public"."reviews" USING "btree" ("reviewee_id");



CREATE INDEX "idx_schedule_events_mover_time" ON "public"."mover_schedule_events" USING "btree" ("mover_id", "starts_at", "ends_at");



CREATE INDEX "idx_subscription_invoices_checkout" ON "public"."subscription_invoices" USING "btree" ("checkout_request_id");



CREATE INDEX "idx_subscription_invoices_status" ON "public"."subscription_invoices" USING "btree" ("status");



CREATE INDEX "idx_subscription_renewal_attempts_subscription" ON "public"."subscription_renewal_attempts" USING "btree" ("subscription_id");



CREATE INDEX "idx_support_tickets_status" ON "public"."support_tickets" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_terms_user_id" ON "public"."terms_acceptance" USING "btree" ("user_id");



CREATE INDEX "idx_tracking_points_booking_recorded_at" ON "public"."moving_tracking_points" USING "btree" ("booking_id", "recorded_at" DESC);



CREATE INDEX "landlord_payment_methods_active_idx" ON "public"."landlord_payment_methods" USING "btree" ("landlord_id", "is_active");



CREATE UNIQUE INDEX "landlord_payment_methods_default_idx" ON "public"."landlord_payment_methods" USING "btree" ("landlord_id") WHERE ("is_default" AND "is_active");



CREATE INDEX "landlord_payment_methods_landlord_idx" ON "public"."landlord_payment_methods" USING "btree" ("landlord_id");



CREATE INDEX "landlord_subscriptions_paypal_status_idx" ON "public"."landlord_subscriptions" USING "btree" ("paypal_status");



CREATE UNIQUE INDEX "landlord_subscriptions_paypal_subscription_uidx" ON "public"."landlord_subscriptions" USING "btree" ("paypal_subscription_id") WHERE ("paypal_subscription_id" IS NOT NULL);



CREATE UNIQUE INDEX "listing_payment_intents_paypal_order_id_key" ON "public"."listing_payment_intents" USING "btree" ("paypal_order_id") WHERE ("paypal_order_id" IS NOT NULL);



CREATE INDEX "listing_payment_intents_provider_reference_idx" ON "public"."listing_payment_intents" USING "btree" ("provider", "provider_reference") WHERE ("provider_reference" IS NOT NULL);



CREATE UNIQUE INDEX "listing_payment_intents_provider_reference_key" ON "public"."listing_payment_intents" USING "btree" ("provider_reference") WHERE ("provider_reference" IS NOT NULL);



CREATE INDEX "listing_payment_intents_user_status_idx" ON "public"."listing_payment_intents" USING "btree" ("user_id", "status", "created_at" DESC);



CREATE INDEX "listing_payments_listing_id_idx" ON "public"."listing_payments" USING "btree" ("listing_id");



CREATE UNIQUE INDEX "listing_payments_paypal_order_id_key" ON "public"."listing_payments" USING "btree" ("paypal_order_id") WHERE ("paypal_order_id" IS NOT NULL);



CREATE INDEX "listing_payments_status_idx" ON "public"."listing_payments" USING "btree" ("status");



CREATE INDEX "listing_payments_user_id_created_at_idx" ON "public"."listing_payments" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "listings_property_management_idx" ON "public"."listings" USING "btree" ("is_property_management");



CREATE INDEX "mover_payouts_mover_id_idx" ON "public"."mover_payouts" USING "btree" ("mover_id");



CREATE UNIQUE INDEX "mover_payouts_provider_reference_unique" ON "public"."mover_payouts" USING "btree" ("payout_provider", "payout_provider_reference") WHERE (("payout_provider" IS NOT NULL) AND ("payout_provider_reference" IS NOT NULL));



CREATE INDEX "mover_schedule_events_mover_time_idx" ON "public"."mover_schedule_events" USING "btree" ("mover_id", "starts_at", "ends_at");



CREATE INDEX "movers_approved_available_idx" ON "public"."movers" USING "btree" ("approval_status", "is_available");



CREATE INDEX "movers_current_location_idx" ON "public"."movers" USING "btree" ("current_latitude", "current_longitude") WHERE (("current_latitude" IS NOT NULL) AND ("current_longitude" IS NOT NULL));



CREATE UNIQUE INDEX "movers_user_id_unique_idx" ON "public"."movers" USING "btree" ("user_id");



CREATE INDEX "moving_cancellation_events_booking_idx" ON "public"."moving_cancellation_events" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "moving_disputes_booking_idx" ON "public"."moving_disputes" USING "btree" ("booking_id");



CREATE UNIQUE INDEX "moving_disputes_open_booking_uidx" ON "public"."moving_disputes" USING "btree" ("booking_id") WHERE ("status" = 'OPEN'::"text");



CREATE INDEX "moving_invoices_mover_idx" ON "public"."moving_invoices" USING "btree" ("mover_id", "created_at" DESC);



CREATE INDEX "moving_invoices_renter_idx" ON "public"."moving_invoices" USING "btree" ("renter_id", "created_at" DESC);



CREATE INDEX "moving_payments_booking_idx" ON "public"."moving_payments" USING "btree" ("booking_id");



CREATE INDEX "moving_payments_invoice_id_idx" ON "public"."moving_payments" USING "btree" ("invoice_id");



CREATE INDEX "moving_payments_payer_idx" ON "public"."moving_payments" USING "btree" ("payer_id", "created_at" DESC);



CREATE UNIQUE INDEX "moving_payments_provider_reference_uidx" ON "public"."moving_payments" USING "btree" ("provider", "provider_reference") WHERE ("provider_reference" IS NOT NULL);



CREATE INDEX "moving_tracking_points_booking_recorded_at_idx" ON "public"."moving_tracking_points" USING "btree" ("booking_id", "recorded_at" DESC);



CREATE INDEX "moving_tracking_points_mover_id_idx" ON "public"."moving_tracking_points" USING "btree" ("mover_id");



CREATE UNIQUE INDEX "one_active_subscription_listing" ON "public"."subscription_listings" USING "btree" ("subscription_id", "listing_id") WHERE ("status" = 'ACTIVE'::"text");



CREATE UNIQUE INDEX "one_current_landlord_subscription" ON "public"."landlord_subscriptions" USING "btree" ("landlord_id") WHERE ("status" = ANY (ARRAY['ACTIVE'::"text", 'GRACE_PERIOD'::"text"]));



CREATE UNIQUE INDEX "one_current_real_estate_subscription" ON "public"."real_estate_subscriptions" USING "btree" ("real_estate_id") WHERE ("status" = ANY (ARRAY['ACTIVE'::"text", 'GRACE_PERIOD'::"text"]));



CREATE UNIQUE INDEX "one_pending_landlord_subscription" ON "public"."landlord_subscriptions" USING "btree" ("landlord_id") WHERE ("status" = 'PENDING_PAYMENT'::"text");



CREATE UNIQUE INDEX "one_pending_real_estate_subscription" ON "public"."real_estate_subscriptions" USING "btree" ("real_estate_id") WHERE ("status" = 'PENDING_PAYMENT'::"text");



CREATE INDEX "payment_webhook_events_invoice_idx" ON "public"."payment_webhook_events" USING "btree" ("invoice_id");



CREATE INDEX "payment_webhook_events_received_idx" ON "public"."payment_webhook_events" USING "btree" ("received_at" DESC);



CREATE UNIQUE INDEX "profiles_email_lower_unique_idx" ON "public"."profiles" USING "btree" ("lower"(TRIM(BOTH FROM "email"))) WHERE (("email" IS NOT NULL) AND (TRIM(BOTH FROM "email") <> ''::"text"));



CREATE INDEX "profiles_role_application_status_idx" ON "public"."profiles" USING "btree" ("role", "landlord_application_status", "mover_application_status", "real_estate_application_status");



CREATE INDEX "property_units_availability_idx" ON "public"."property_units" USING "btree" ("availability");



CREATE INDEX "property_units_listing_id_idx" ON "public"."property_units" USING "btree" ("listing_id");



CREATE INDEX "property_units_rent_paid_through_idx" ON "public"."property_units" USING "btree" ("rent_paid_through_month") WHERE ("rent_paid_through_month" IS NOT NULL);



CREATE INDEX "property_units_user_id_idx" ON "public"."property_units" USING "btree" ("user_id");



CREATE INDEX "real_estate_subscriptions_paypal_status_idx" ON "public"."real_estate_subscriptions" USING "btree" ("paypal_status");



CREATE UNIQUE INDEX "real_estate_subscriptions_paypal_subscription_uidx" ON "public"."real_estate_subscriptions" USING "btree" ("paypal_subscription_id") WHERE ("paypal_subscription_id" IS NOT NULL);



CREATE INDEX "real_estate_subscriptions_plan_idx" ON "public"."real_estate_subscriptions" USING "btree" ("plan_id");



CREATE INDEX "real_estate_subscriptions_user_idx" ON "public"."real_estate_subscriptions" USING "btree" ("real_estate_id");



CREATE INDEX "rent_invoice_periods_assoc_idx" ON "public"."rent_invoice_periods" USING "btree" ("renter_assoc_id", "period_year", "period_month");



CREATE INDEX "rent_invoice_periods_invoice_idx" ON "public"."rent_invoice_periods" USING "btree" ("invoice_id");



CREATE INDEX "rent_invoices_landlord_idx" ON "public"."rent_invoices" USING "btree" ("landlord_id", "created_at" DESC);



CREATE INDEX "rent_invoices_renter_idx" ON "public"."rent_invoices" USING "btree" ("renter_user_id", "created_at" DESC);



CREATE INDEX "rent_invoices_unit_idx" ON "public"."rent_invoices" USING "btree" ("unit_id", "due_date");



CREATE INDEX "rent_payment_intents_assoc_idx" ON "public"."rent_payment_intents" USING "btree" ("renter_assoc_id", "created_at" DESC);



CREATE UNIQUE INDEX "rent_payment_intents_checkout_uidx" ON "public"."rent_payment_intents" USING "btree" ("checkout_request_id") WHERE ("checkout_request_id" IS NOT NULL);



CREATE UNIQUE INDEX "rent_payment_intents_paypal_order_uidx" ON "public"."rent_payment_intents" USING "btree" ("paypal_order_id") WHERE ("paypal_order_id" IS NOT NULL);



CREATE UNIQUE INDEX "rent_payment_intents_provider_ref_uidx" ON "public"."rent_payment_intents" USING "btree" ("provider", "provider_reference") WHERE (("provider" IS NOT NULL) AND ("provider_reference" IS NOT NULL));



CREATE INDEX "rent_payment_intents_renter_idx" ON "public"."rent_payment_intents" USING "btree" ("renter_user_id", "created_at" DESC);



CREATE INDEX "rent_payment_submissions_invoice_idx" ON "public"."rent_payment_submissions" USING "btree" ("invoice_id", "submitted_at" DESC);



CREATE INDEX "rent_payment_submissions_landlord_idx" ON "public"."rent_payment_submissions" USING "btree" ("landlord_id", "status", "submitted_at" DESC);



CREATE UNIQUE INDEX "rent_payment_submissions_transaction_reference_uq" ON "public"."rent_payment_submissions" USING "btree" ("lower"(TRIM(BOTH FROM "transaction_reference")));



CREATE UNIQUE INDEX "rent_payments_checkout_request_id_uidx" ON "public"."rent_payments" USING "btree" ("checkout_request_id") WHERE ("checkout_request_id" IS NOT NULL);



CREATE UNIQUE INDEX "rent_payments_mpesa_receipt_uidx" ON "public"."rent_payments" USING "btree" ("mpesa_receipt") WHERE ("mpesa_receipt" IS NOT NULL);



CREATE UNIQUE INDEX "rent_payments_mpesa_receipt_unique_idx" ON "public"."rent_payments" USING "btree" ("mpesa_receipt") WHERE (("mpesa_receipt" IS NOT NULL) AND ("status" = 'PAID'::"text"));



CREATE UNIQUE INDEX "rent_payments_paypal_order_uidx" ON "public"."rent_payments" USING "btree" ("paypal_order_id") WHERE ("paypal_order_id" IS NOT NULL);



CREATE UNIQUE INDEX "rent_payments_period_uidx" ON "public"."rent_payments" USING "btree" ("renter_assoc_id", "unit_id", "period_year", "period_month");



CREATE UNIQUE INDEX "rent_payments_provider_ref_uidx" ON "public"."rent_payments" USING "btree" ("payment_provider", "provider_reference") WHERE (("payment_provider" IS NOT NULL) AND ("provider_reference" IS NOT NULL));



CREATE UNIQUE INDEX "renter_unit_associations_invite_token_hash_key" ON "public"."renter_unit_associations" USING "btree" ("invite_token_hash");



CREATE UNIQUE INDEX "renter_unit_associations_one_active_per_unit_idx" ON "public"."renter_unit_associations" USING "btree" ("unit_id") WHERE ("status" = 'ACTIVE'::"text");



CREATE UNIQUE INDEX "reviews_mover_booking_uidx" ON "public"."reviews" USING "btree" ("booking_id") WHERE ("booking_id" IS NOT NULL);



CREATE UNIQUE INDEX "subscription_invoices_checkout_request_unique" ON "public"."subscription_invoices" USING "btree" ("checkout_request_id") WHERE ("checkout_request_id" IS NOT NULL);



CREATE INDEX "subscription_invoices_landlord_subscription_idx" ON "public"."subscription_invoices" USING "btree" ("landlord_subscription_id");



CREATE INDEX "subscription_invoices_paypal_subscription_idx" ON "public"."subscription_invoices" USING "btree" ("paypal_subscription_id");



CREATE UNIQUE INDEX "subscription_invoices_paypal_transaction_uidx" ON "public"."subscription_invoices" USING "btree" ("payment_provider", "provider_transaction_id") WHERE (("payment_provider" = 'PAYPAL'::"text") AND ("provider_transaction_id" IS NOT NULL));



CREATE INDEX "subscription_invoices_provider_ref_idx" ON "public"."subscription_invoices" USING "btree" ("payment_provider", "provider_reference");



CREATE UNIQUE INDEX "subscription_invoices_provider_reference_uidx" ON "public"."subscription_invoices" USING "btree" ("payment_provider", "provider_reference") WHERE ("provider_reference" IS NOT NULL);



CREATE UNIQUE INDEX "subscription_invoices_provider_transaction_uidx" ON "public"."subscription_invoices" USING "btree" ("payment_provider", "provider_transaction_id") WHERE ("provider_transaction_id" IS NOT NULL);



CREATE INDEX "subscription_invoices_real_estate_subscription_idx" ON "public"."subscription_invoices" USING "btree" ("real_estate_subscription_id");



CREATE INDEX "subscription_listings_active_idx" ON "public"."subscription_listings" USING "btree" ("subscription_id") WHERE ("status" = 'ACTIVE'::"text");



CREATE INDEX "subscription_listings_listing_idx" ON "public"."subscription_listings" USING "btree" ("listing_id");



CREATE INDEX "subscription_listings_real_estate_subscription_idx" ON "public"."subscription_listings" USING "btree" ("real_estate_subscription_id");



CREATE INDEX "subscription_listings_subscription_idx" ON "public"."subscription_listings" USING "btree" ("subscription_id");



CREATE UNIQUE INDEX "subscription_plans_audience_name_uidx" ON "public"."subscription_plans" USING "btree" ("audience", "lower"("name"));



CREATE UNIQUE INDEX "subscription_plans_paypal_annual_uidx" ON "public"."subscription_plans" USING "btree" ("paypal_annual_plan_id") WHERE ("paypal_annual_plan_id" IS NOT NULL);



CREATE UNIQUE INDEX "subscription_plans_paypal_monthly_uidx" ON "public"."subscription_plans" USING "btree" ("paypal_monthly_plan_id") WHERE ("paypal_monthly_plan_id" IS NOT NULL);



CREATE UNIQUE INDEX "subscription_plans_paypal_product_uidx" ON "public"."subscription_plans" USING "btree" ("paypal_product_id") WHERE ("paypal_product_id" IS NOT NULL);



CREATE INDEX "subscription_renewal_attempts_provider_ref_idx" ON "public"."subscription_renewal_attempts" USING "btree" ("payment_provider", "provider_reference");



CREATE INDEX "subscription_renewal_attempts_real_estate_idx" ON "public"."subscription_renewal_attempts" USING "btree" ("real_estate_subscription_id");



CREATE UNIQUE INDEX "uq_mover_payouts_booking" ON "public"."mover_payouts" USING "btree" ("booking_id");



CREATE UNIQUE INDEX "uq_moving_disputes_open_booking" ON "public"."moving_disputes" USING "btree" ("booking_id") WHERE ("status" = 'OPEN'::"text");



CREATE UNIQUE INDEX "uq_moving_invoices_booking" ON "public"."moving_invoices" USING "btree" ("booking_id");



CREATE UNIQUE INDEX "user_notifications_event_key_uidx" ON "public"."user_notifications" USING "btree" ("event_key") WHERE ("event_key" IS NOT NULL);



CREATE INDEX "user_notifications_user_created_idx" ON "public"."user_notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "bookings_create_mover_payout" AFTER INSERT OR UPDATE OF "payment_status" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_mover_payout_for_paid_booking"();



CREATE OR REPLACE TRIGGER "bookings_set_mover_pricing" BEFORE INSERT OR UPDATE OF "mover_id", "distance_km" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."set_booking_mover_pricing"();



CREATE OR REPLACE TRIGGER "enforce_property_unit_entitlement_trigger" BEFORE INSERT ON "public"."property_units" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_property_unit_entitlement"();



CREATE OR REPLACE TRIGGER "listing_payment_intents_updated_at" BEFORE UPDATE ON "public"."listing_payment_intents" FOR EACH ROW EXECUTE FUNCTION "public"."touch_listing_payment_intent_updated_at"();



CREATE OR REPLACE TRIGGER "on_application_decision" AFTER UPDATE OF "landlord_application_status", "mover_application_status" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."notify_application_decision"();



CREATE OR REPLACE TRIGGER "on_listing_approved" AFTER UPDATE OF "approval_status" ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."notify_listing_approved"();



CREATE OR REPLACE TRIGGER "on_listing_approved_publish_community" AFTER UPDATE OF "approval_status", "is_published" ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."publish_approved_listing_to_community"();



CREATE OR REPLACE TRIGGER "on_listing_payment_success_notifications" AFTER UPDATE OF "status" ON "public"."listing_payments" FOR EACH ROW EXECUTE FUNCTION "public"."queue_payment_success_notifications"();



CREATE OR REPLACE TRIGGER "on_listing_posted" AFTER INSERT ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."notify_listing_posted"();



CREATE OR REPLACE TRIGGER "on_subscription_payment_success_notifications" AFTER UPDATE OF "status" ON "public"."subscription_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."queue_subscription_payment_notifications"();



CREATE OR REPLACE TRIGGER "platform_settings_set_updated_at" BEFORE UPDATE ON "public"."platform_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_platform_settings_updated_at"();



CREATE OR REPLACE TRIGGER "protect_listing_admin_fields_trigger" BEFORE INSERT OR UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."protect_listing_admin_fields"();



CREATE OR REPLACE TRIGGER "protect_listing_payment_creation_trigger" BEFORE INSERT ON "public"."listing_payments" FOR EACH ROW EXECUTE FUNCTION "public"."protect_listing_payment_creation"();



CREATE OR REPLACE TRIGGER "protect_mover_admin_fields_trigger" BEFORE UPDATE ON "public"."movers" FOR EACH ROW EXECUTE FUNCTION "public"."protect_mover_admin_fields"();



CREATE OR REPLACE TRIGGER "protect_mover_application_admin_fields_trigger" BEFORE UPDATE ON "public"."mover_applications" FOR EACH ROW EXECUTE FUNCTION "public"."protect_mover_application_admin_fields"();



CREATE OR REPLACE TRIGGER "protect_profile_kyc_verification_fields_trigger" BEFORE UPDATE OF "kyc_completed", "verification_status", "email_verified", "free_listings_used", "role_selected_at", "landlord_application_status", "mover_application_status" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_kyc_verification_fields"();



CREATE OR REPLACE TRIGGER "protect_profile_role_transition_trigger" BEFORE UPDATE OF "role" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_role_transition"();



CREATE OR REPLACE TRIGGER "set_landlord_subscription_updated_at" BEFORE UPDATE ON "public"."landlord_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_subscription_updated_at"();



CREATE OR REPLACE TRIGGER "sync_mover_profile_application_status_trigger" AFTER UPDATE OF "mover_application_status" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_mover_profile_application_status"();



CREATE OR REPLACE TRIGGER "trg_sync_renter_assoc_rent" BEFORE INSERT OR UPDATE OF "unit_id", "rent_amount" ON "public"."renter_unit_associations" FOR EACH ROW EXECUTE FUNCTION "public"."sync_renter_assoc_rent_from_unit"();



CREATE OR REPLACE TRIGGER "trg_validate_rent_payment_relationship" BEFORE INSERT OR UPDATE OF "renter_assoc_id", "unit_id", "landlord_id", "amount_kes", "period_year", "period_month", "status", "paid_at" ON "public"."rent_payments" FOR EACH ROW EXECUTE FUNCTION "public"."validate_rent_payment_relationship"();



CREATE OR REPLACE TRIGGER "trg_validate_renter_unit_association" BEFORE INSERT OR UPDATE OF "unit_id", "landlord_id", "renter_user_id", "status" ON "public"."renter_unit_associations" FOR EACH ROW EXECUTE FUNCTION "public"."validate_renter_unit_association"();



CREATE OR REPLACE TRIGGER "update_bookings_updated_at" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_listings_updated_at" BEFORE UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_mover_payouts_updated_at" BEFORE UPDATE ON "public"."mover_payouts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_movers_updated_at" BEFORE UPDATE ON "public"."movers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_support_tickets_updated_at" BEFORE UPDATE ON "public"."support_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "validate_moving_payment_state_trigger" BEFORE INSERT OR UPDATE ON "public"."moving_payments" FOR EACH ROW EXECUTE FUNCTION "public"."validate_moving_payment_state"();



ALTER TABLE ONLY "public"."booking_events"
    ADD CONSTRAINT "booking_events_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_events"
    ADD CONSTRAINT "booking_events_renter_id_fkey" FOREIGN KEY ("renter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_renter_id_fkey" FOREIGN KEY ("renter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."landlord_payment_methods"
    ADD CONSTRAINT "landlord_payment_methods_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."landlord_subscriptions"
    ADD CONSTRAINT "landlord_subscriptions_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."landlord_subscriptions"
    ADD CONSTRAINT "landlord_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."listing_media"
    ADD CONSTRAINT "listing_media_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_media"
    ADD CONSTRAINT "listing_media_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."property_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_media"
    ADD CONSTRAINT "listing_media_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_payment_intents"
    ADD CONSTRAINT "listing_payment_intents_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listing_payment_intents"
    ADD CONSTRAINT "listing_payment_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_payments"
    ADD CONSTRAINT "listing_payments_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_payments"
    ADD CONSTRAINT "listing_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mover_applications"
    ADD CONSTRAINT "mover_applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mover_applications"
    ADD CONSTRAINT "mover_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mover_payouts"
    ADD CONSTRAINT "mover_payouts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mover_payouts"
    ADD CONSTRAINT "mover_payouts_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mover_schedule_events"
    ADD CONSTRAINT "mover_schedule_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mover_schedule_events"
    ADD CONSTRAINT "mover_schedule_events_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."movers"
    ADD CONSTRAINT "movers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."moving_cancellation_events"
    ADD CONSTRAINT "moving_cancellation_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."moving_cancellation_events"
    ADD CONSTRAINT "moving_cancellation_events_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."moving_disputes"
    ADD CONSTRAINT "moving_disputes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."moving_disputes"
    ADD CONSTRAINT "moving_disputes_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."moving_disputes"
    ADD CONSTRAINT "moving_disputes_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."moving_invoices"
    ADD CONSTRAINT "moving_invoices_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."moving_invoices"
    ADD CONSTRAINT "moving_invoices_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id");



ALTER TABLE ONLY "public"."moving_invoices"
    ADD CONSTRAINT "moving_invoices_renter_id_fkey" FOREIGN KEY ("renter_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."moving_payments"
    ADD CONSTRAINT "moving_payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."moving_payments"
    ADD CONSTRAINT "moving_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."moving_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."moving_payments"
    ADD CONSTRAINT "moving_payments_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."moving_tracking_points"
    ADD CONSTRAINT "moving_tracking_points_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."moving_tracking_points"
    ADD CONSTRAINT "moving_tracking_points_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."subscription_invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pms_subscription_notifications"
    ADD CONSTRAINT "pms_subscription_notifications_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pms_subscription_notifications"
    ADD CONSTRAINT "pms_subscription_notifications_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."landlord_subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."property_units"
    ADD CONSTRAINT "property_units_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."property_units"
    ADD CONSTRAINT "property_units_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."real_estate_subscriptions"
    ADD CONSTRAINT "real_estate_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id");



ALTER TABLE ONLY "public"."real_estate_subscriptions"
    ADD CONSTRAINT "real_estate_subscriptions_real_estate_id_fkey" FOREIGN KEY ("real_estate_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_invoice_periods"
    ADD CONSTRAINT "rent_invoice_periods_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."rent_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_invoice_periods"
    ADD CONSTRAINT "rent_invoice_periods_renter_assoc_id_fkey" FOREIGN KEY ("renter_assoc_id") REFERENCES "public"."renter_unit_associations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rent_invoice_periods"
    ADD CONSTRAINT "rent_invoice_periods_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."property_units"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rent_invoices"
    ADD CONSTRAINT "rent_invoices_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rent_invoices"
    ADD CONSTRAINT "rent_invoices_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_invoices"
    ADD CONSTRAINT "rent_invoices_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rent_invoices"
    ADD CONSTRAINT "rent_invoices_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "public"."landlord_payment_methods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rent_invoices"
    ADD CONSTRAINT "rent_invoices_renter_assoc_id_fkey" FOREIGN KEY ("renter_assoc_id") REFERENCES "public"."renter_unit_associations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rent_invoices"
    ADD CONSTRAINT "rent_invoices_renter_user_id_fkey" FOREIGN KEY ("renter_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_invoices"
    ADD CONSTRAINT "rent_invoices_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."property_units"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rent_payment_intents"
    ADD CONSTRAINT "rent_payment_intents_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "public"."landlord_payment_methods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rent_payment_submissions"
    ADD CONSTRAINT "rent_payment_submissions_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rent_payment_submissions"
    ADD CONSTRAINT "rent_payment_submissions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."rent_invoices"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rent_payment_submissions"
    ADD CONSTRAINT "rent_payment_submissions_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_payment_submissions"
    ADD CONSTRAINT "rent_payment_submissions_renter_assoc_id_fkey" FOREIGN KEY ("renter_assoc_id") REFERENCES "public"."renter_unit_associations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rent_payment_submissions"
    ADD CONSTRAINT "rent_payment_submissions_renter_user_id_fkey" FOREIGN KEY ("renter_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_payment_submissions"
    ADD CONSTRAINT "rent_payment_submissions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."property_units"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rent_payments"
    ADD CONSTRAINT "rent_payments_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_payments"
    ADD CONSTRAINT "rent_payments_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "public"."landlord_payment_methods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rent_payments"
    ADD CONSTRAINT "rent_payments_renter_assoc_id_fkey" FOREIGN KEY ("renter_assoc_id") REFERENCES "public"."renter_unit_associations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_payments"
    ADD CONSTRAINT "rent_payments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."property_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_reminder_settings"
    ADD CONSTRAINT "rent_reminder_settings_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_reminder_settings"
    ADD CONSTRAINT "rent_reminder_settings_renter_assoc_id_fkey" FOREIGN KEY ("renter_assoc_id") REFERENCES "public"."renter_unit_associations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_reminders"
    ADD CONSTRAINT "rent_reminders_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_reminders"
    ADD CONSTRAINT "rent_reminders_renter_assoc_id_fkey" FOREIGN KEY ("renter_assoc_id") REFERENCES "public"."renter_unit_associations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."renter_notifications"
    ADD CONSTRAINT "renter_notifications_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."renter_notifications"
    ADD CONSTRAINT "renter_notifications_renter_assoc_id_fkey" FOREIGN KEY ("renter_assoc_id") REFERENCES "public"."renter_unit_associations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."renter_notifications"
    ADD CONSTRAINT "renter_notifications_renter_user_id_fkey" FOREIGN KEY ("renter_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."renter_unit_associations"
    ADD CONSTRAINT "renter_unit_associations_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."renter_unit_associations"
    ADD CONSTRAINT "renter_unit_associations_renter_user_id_fkey" FOREIGN KEY ("renter_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."renter_unit_associations"
    ADD CONSTRAINT "renter_unit_associations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."property_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "public"."movers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_reviewee_id_fkey" FOREIGN KEY ("reviewee_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_invoices"
    ADD CONSTRAINT "subscription_invoices_landlord_subscription_id_fkey" FOREIGN KEY ("landlord_subscription_id") REFERENCES "public"."landlord_subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_invoices"
    ADD CONSTRAINT "subscription_invoices_real_estate_subscription_id_fkey" FOREIGN KEY ("real_estate_subscription_id") REFERENCES "public"."real_estate_subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_listings"
    ADD CONSTRAINT "subscription_listings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_listings"
    ADD CONSTRAINT "subscription_listings_real_estate_subscription_id_fkey" FOREIGN KEY ("real_estate_subscription_id") REFERENCES "public"."real_estate_subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_listings"
    ADD CONSTRAINT "subscription_listings_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."landlord_subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_renewal_attempts"
    ADD CONSTRAINT "subscription_renewal_attempts_real_estate_fk" FOREIGN KEY ("real_estate_subscription_id") REFERENCES "public"."real_estate_subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_renewal_attempts"
    ADD CONSTRAINT "subscription_renewal_attempts_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."landlord_subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."terms_acceptance"
    ADD CONSTRAINT "terms_acceptance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Authenticated users can view subscription plans" ON "public"."subscription_plans" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Landlords can create own property units" ON "public"."property_units" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Landlords can delete own property units" ON "public"."property_units" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Landlords can update own property units" ON "public"."property_units" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Landlords can view own property units" ON "public"."property_units" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Landlords can view own subscription" ON "public"."landlord_subscriptions" FOR SELECT TO "authenticated" USING (("landlord_id" = "auth"."uid"()));



CREATE POLICY "Subscription owners can view own invoices" ON "public"."subscription_invoices" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."landlord_subscriptions" "ls"
  WHERE (("ls"."id" = "subscription_invoices"."landlord_subscription_id") AND ("ls"."landlord_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."real_estate_subscriptions" "rs"
  WHERE (("rs"."id" = "subscription_invoices"."real_estate_subscription_id") AND ("rs"."real_estate_id" = "auth"."uid"()))))));



CREATE POLICY "admins_can_update_listings" ON "public"."listings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



ALTER TABLE "public"."booking_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_events_select_authorized" ON "public"."booking_events" FOR SELECT TO "authenticated" USING ((("renter_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."movers" "m"
  WHERE (("m"."id" = "booking_events"."mover_profile_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"text"))))));



ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookings_select_own" ON "public"."bookings" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "renter_id") OR (EXISTS ( SELECT 1
   FROM "public"."movers"
  WHERE (("movers"."id" = "bookings"."mover_id") AND ("movers"."user_id" = "auth"."uid"()))))));



CREATE POLICY "bookings_select_participant" ON "public"."bookings" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "renter_id") OR (EXISTS ( SELECT 1
   FROM "public"."movers" "m"
  WHERE (("m"."id" = "bookings"."mover_id") AND ("m"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))));



CREATE POLICY "cancellations participant read" ON "public"."moving_cancellation_events" FOR SELECT TO "authenticated" USING ((("cancelled_by" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "moving_cancellation_events"."booking_id") AND ("b"."renter_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."movers" "m" ON (("m"."id" = "b"."mover_id")))
  WHERE (("b"."id" = "moving_cancellation_events"."booking_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "community_posts_delete_own" ON "public"."community_posts" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "community_posts_insert_own" ON "public"."community_posts" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "community_posts_select_visible" ON "public"."community_posts" FOR SELECT TO "authenticated" USING ((("listing_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "community_posts"."listing_id") AND ("listings"."approval_status" = 'approved'::"text") AND ("listings"."is_published" = true))))));



CREATE POLICY "community_posts_update_own" ON "public"."community_posts" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "delete_own_renter_assoc" ON "public"."renter_unit_associations" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "landlord_id"));



ALTER TABLE "public"."exchange_rate_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_own_booking_events" ON "public"."booking_events" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "renter_id"));



CREATE POLICY "insert_own_chat_messages" ON "public"."chat_messages" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "sender_id") AND ("conversation_id" = (((LEAST("sender_id", "receiver_id"))::"text" || '__'::"text") || (GREATEST("sender_id", "receiver_id"))::"text")) AND (((EXISTS ( SELECT 1
   FROM "public"."profiles" "sender_profile"
  WHERE (("sender_profile"."id" = "chat_messages"."sender_id") AND ("sender_profile"."role" = 'renter'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."movers" "receiver_mover"
  WHERE (("receiver_mover"."user_id" = "chat_messages"."receiver_id") AND ("receiver_mover"."approval_status" = 'approved'::"text"))))) OR ((EXISTS ( SELECT 1
   FROM "public"."movers" "sender_mover"
  WHERE (("sender_mover"."user_id" = "chat_messages"."sender_id") AND ("sender_mover"."approval_status" = 'approved'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "receiver_profile"
  WHERE (("receiver_profile"."id" = "chat_messages"."receiver_id") AND ("receiver_profile"."role" = 'renter'::"text"))))))));



CREATE POLICY "insert_own_renter_assoc" ON "public"."renter_unit_associations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "landlord_id"));



ALTER TABLE "public"."landlord_payment_methods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "landlord_payment_methods_delete_own" ON "public"."landlord_payment_methods" FOR DELETE TO "authenticated" USING (("landlord_id" = "auth"."uid"()));



CREATE POLICY "landlord_payment_methods_insert_own" ON "public"."landlord_payment_methods" FOR INSERT TO "authenticated" WITH CHECK (("landlord_id" = "auth"."uid"()));



CREATE POLICY "landlord_payment_methods_select_own" ON "public"."landlord_payment_methods" FOR SELECT TO "authenticated" USING (("landlord_id" = "auth"."uid"()));



CREATE POLICY "landlord_payment_methods_update_own" ON "public"."landlord_payment_methods" FOR UPDATE TO "authenticated" USING (("landlord_id" = "auth"."uid"())) WITH CHECK (("landlord_id" = "auth"."uid"()));



ALTER TABLE "public"."landlord_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "landlords_can_view_own_listing_payments" ON "public"."listing_payments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."listing_media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "listing_media_delete_own" ON "public"."listing_media" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "listing_media_insert_own" ON "public"."listing_media" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "listing_media_select_approved" ON "public"."listing_media" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_media"."listing_id") AND ("listings"."approval_status" = 'approved'::"text") AND ("listings"."is_published" = true)))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "listing_media_update_own" ON "public"."listing_media" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."listing_payment_intents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "listing_payment_intents_select_own" ON "public"."listing_payment_intents" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."listing_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "listing_payments_select_own" ON "public"."listing_payments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "listings_delete_own" ON "public"."listings" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "listings_select_approved_verified" ON "public"."listings" FOR SELECT TO "authenticated" USING ((("is_approved" = true) AND ("is_published" = true) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."email_verified" = true))))));



CREATE POLICY "listings_select_own_verified" ON "public"."listings" FOR SELECT TO "authenticated" USING ((((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."email_verified" = true))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"text") AND ("p"."email_verified" = true))))));



CREATE POLICY "listings_update_own" ON "public"."listings" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['landlord'::"text", 'real_estate'::"text"])) AND ("profiles"."kyc_completed" = true) AND ("profiles"."landlord_application_status" = 'approved'::"text")))))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['landlord'::"text", 'real_estate'::"text"])) AND ("profiles"."kyc_completed" = true) AND ("profiles"."landlord_application_status" = 'approved'::"text"))))));



ALTER TABLE "public"."mover_applications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mover_applications_delete_admin" ON "public"."mover_applications" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "mover_applications_insert_own" ON "public"."mover_applications" FOR INSERT TO "authenticated" WITH CHECK (("applicant_id" = "auth"."uid"()));



CREATE POLICY "mover_applications_select_own_or_admin" ON "public"."mover_applications" FOR SELECT TO "authenticated" USING ((("applicant_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))));



CREATE POLICY "mover_applications_update_admin" ON "public"."mover_applications" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



ALTER TABLE "public"."mover_payouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mover_payouts_select_admin_or_mover" ON "public"."mover_payouts" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."movers"
  WHERE (("movers"."id" = "mover_payouts"."mover_id") AND ("movers"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "mover_payouts_select_authorized" ON "public"."mover_payouts" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."movers" "m"
  WHERE (("m"."id" = "mover_payouts"."mover_id") AND ("m"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))));



ALTER TABLE "public"."mover_schedule_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "movers_delete_own" ON "public"."movers" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "movers_insert_own" ON "public"."movers" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "movers_select_approved" ON "public"."movers" FOR SELECT TO "authenticated" USING (((("approval_status" = 'approved'::"text") AND ("is_available" = true)) OR ("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "movers_update_admin" ON "public"."movers" FOR UPDATE TO "authenticated" USING ("public"."is_current_user_admin"()) WITH CHECK ("public"."is_current_user_admin"());



CREATE POLICY "moving invoices mover own" ON "public"."moving_invoices" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."movers" "m"
  WHERE (("m"."id" = "moving_invoices"."mover_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "moving invoices renter own" ON "public"."moving_invoices" FOR SELECT TO "authenticated" USING (("renter_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "moving payments mover own" ON "public"."moving_payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."moving_invoices" "i"
     JOIN "public"."movers" "m" ON (("m"."id" = "i"."mover_id")))
  WHERE (("i"."id" = "moving_payments"."invoice_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "moving payments payer own" ON "public"."moving_payments" FOR SELECT TO "authenticated" USING (("payer_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."moving_cancellation_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."moving_disputes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "moving_disputes_participant_select" ON "public"."moving_disputes" FOR SELECT TO "authenticated" USING ((("opened_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."movers" "m" ON (("m"."id" = "b"."mover_id")))
  WHERE (("b"."id" = "moving_disputes"."booking_id") AND (("b"."renter_id" = "auth"."uid"()) OR ("m"."user_id" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))));



ALTER TABLE "public"."moving_invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "moving_invoices_select_authorized" ON "public"."moving_invoices" FOR SELECT TO "authenticated" USING ((("renter_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."movers" "m"
  WHERE (("m"."id" = "moving_invoices"."mover_id") AND ("m"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))));



ALTER TABLE "public"."moving_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "moving_payments_select_authorized" ON "public"."moving_payments" FOR SELECT TO "authenticated" USING ((("payer_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."moving_invoices" "i"
     JOIN "public"."movers" "m" ON (("m"."id" = "i"."mover_id")))
  WHERE (("i"."id" = "moving_payments"."invoice_id") AND ("m"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))));



ALTER TABLE "public"."moving_tracking_points" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "moving_tracking_points_select_authorized" ON "public"."moving_tracking_points" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "moving_tracking_points"."booking_id") AND ("b"."status" = ANY (ARRAY['in_progress'::"text", 'completed'::"text"])) AND (("b"."renter_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."movers" "m"
          WHERE (("m"."id" = "b"."mover_id") AND ("m"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))))))));



ALTER TABLE "public"."notification_emails" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_settings_select_authenticated" ON "public"."platform_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "platform_settings_update_admin" ON "public"."platform_settings" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IN ( SELECT "p"."id"
   FROM "public"."profiles" "p"
  WHERE ("p"."role" = 'admin'::"text")))) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") IN ( SELECT "p"."id"
   FROM "public"."profiles" "p"
  WHERE ("p"."role" = 'admin'::"text"))));



ALTER TABLE "public"."pms_subscription_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_select_admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_current_user_admin"());



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update_admin" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_current_user_admin"()) WITH CHECK ("public"."is_current_user_admin"());



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK ((("auth"."uid"() = "id") AND ("role" = ANY (ARRAY['renter'::"text", 'landlord'::"text", 'mover'::"text", 'real_estate'::"text"]))));



ALTER TABLE "public"."property_units" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "real_estate_subscription_owner_select" ON "public"."real_estate_subscriptions" FOR SELECT TO "authenticated" USING (("real_estate_id" = "auth"."uid"()));



ALTER TABLE "public"."real_estate_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rent_invoice_periods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rent_invoice_periods_select_participant" ON "public"."rent_invoice_periods" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."rent_invoices" "ri"
  WHERE (("ri"."id" = "rent_invoice_periods"."invoice_id") AND (("ri"."landlord_id" = "auth"."uid"()) OR ("ri"."renter_user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."rent_invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rent_invoices_select_participant" ON "public"."rent_invoices" FOR SELECT TO "authenticated" USING ((("landlord_id" = "auth"."uid"()) OR ("renter_user_id" = "auth"."uid"())));



ALTER TABLE "public"."rent_payment_intents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rent_payment_intents_renter_select" ON "public"."rent_payment_intents" FOR SELECT TO "authenticated" USING (("renter_user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."rent_payment_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rent_payment_submissions_select_participant" ON "public"."rent_payment_submissions" FOR SELECT TO "authenticated" USING ((("landlord_id" = "auth"."uid"()) OR ("renter_user_id" = "auth"."uid"())));



ALTER TABLE "public"."rent_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rent_payments_renter_select" ON "public"."rent_payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."renter_unit_associations" "ra"
  WHERE (("ra"."id" = "rent_payments"."renter_assoc_id") AND ("ra"."renter_user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."rent_reminder_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rent_reminder_settings_landlord_delete" ON "public"."rent_reminder_settings" FOR DELETE TO "authenticated" USING (("landlord_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "rent_reminder_settings_landlord_insert" ON "public"."rent_reminder_settings" FOR INSERT TO "authenticated" WITH CHECK (("landlord_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "rent_reminder_settings_landlord_select" ON "public"."rent_reminder_settings" FOR SELECT TO "authenticated" USING (("landlord_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "rent_reminder_settings_landlord_update" ON "public"."rent_reminder_settings" FOR UPDATE TO "authenticated" USING (("landlord_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("landlord_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."rent_reminders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rent_reminders_landlord_select" ON "public"."rent_reminders" FOR SELECT TO "authenticated" USING (("landlord_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."renter_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "renter_notifications_owner_select" ON "public"."renter_notifications" FOR SELECT TO "authenticated" USING (("renter_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "renter_notifications_owner_update" ON "public"."renter_notifications" FOR UPDATE TO "authenticated" USING (("renter_user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("renter_user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."renter_unit_associations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "renter_unit_associations_renter_select" ON "public"."renter_unit_associations" FOR SELECT TO "authenticated" USING (("renter_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "renter_view_associated_property_units" ON "public"."property_units" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."renter_unit_associations" "ra"
  WHERE (("ra"."unit_id" = "property_units"."id") AND ("ra"."renter_user_id" = "auth"."uid"()) AND ("ra"."status" = 'ACTIVE'::"text")))));



ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews_delete_own" ON "public"."reviews" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "reviewer_id"));



CREATE POLICY "reviews_insert_own" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "reviewer_id"));



CREATE POLICY "reviews_select_all" ON "public"."reviews" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "reviews_update_own" ON "public"."reviews" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "reviewer_id")) WITH CHECK (("auth"."uid"() = "reviewer_id"));



CREATE POLICY "schedule mover own" ON "public"."mover_schedule_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."movers" "m"
  WHERE (("m"."id" = "mover_schedule_events"."mover_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "schedule renter own booking" ON "public"."mover_schedule_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "mover_schedule_events"."booking_id") AND ("b"."renter_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "select_own_chat_messages" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "sender_id") OR (( SELECT "auth"."uid"() AS "uid") = "receiver_id")));



CREATE POLICY "select_own_rent_payments" ON "public"."rent_payments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "landlord_id"));



CREATE POLICY "select_own_renter_assoc" ON "public"."renter_unit_associations" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "landlord_id"));



ALTER TABLE "public"."subscription_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_listings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscription_listings_owner_select" ON "public"."subscription_listings" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."landlord_subscriptions" "ls"
  WHERE (("ls"."id" = "subscription_listings"."subscription_id") AND ("ls"."landlord_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."real_estate_subscriptions" "rs"
  WHERE (("rs"."id" = "subscription_listings"."real_estate_subscription_id") AND ("rs"."real_estate_id" = "auth"."uid"()))))));



ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_renewal_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_tickets_delete_admin" ON "public"."support_tickets" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "support_tickets_insert_public" ON "public"."support_tickets" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("user_id" IS NULL) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "support_tickets_select_admin_or_owner" ON "public"."support_tickets" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "support_tickets_update_admin" ON "public"."support_tickets" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



ALTER TABLE "public"."terms_acceptance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "terms_insert_own" ON "public"."terms_acceptance" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "terms_select_own" ON "public"."terms_acceptance" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "terms_update_own" ON "public"."terms_acceptance" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "update_own_booking_events" ON "public"."booking_events" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "renter_id") OR ("auth"."uid"() = "mover_id"))) WITH CHECK ((("auth"."uid"() = "renter_id") OR ("auth"."uid"() = "mover_id")));



CREATE POLICY "update_own_renter_assoc" ON "public"."renter_unit_associations" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "landlord_id")) WITH CHECK (("auth"."uid"() = "landlord_id"));



ALTER TABLE "public"."user_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_notifications_select_own" ON "public"."user_notifications" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "user_notifications_update_own" ON "public"."user_notifications" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_listing_to_pms"("p_subscription_id" "uuid", "p_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_listing_to_pms"("p_subscription_id" "uuid", "p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_listing_to_pms"("p_subscription_id" "uuid", "p_listing_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_release_escrow"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_release_escrow"("p_booking_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_release_escrow"("p_booking_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_release_mover_payout"("p_payout_id" "uuid", "p_tranche" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_release_mover_payout"("p_payout_id" "uuid", "p_tranche" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_release_mover_payout"("p_payout_id" "uuid", "p_tranche" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_review_landlord_application"("p_user_id" "uuid", "p_decision" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_review_landlord_application"("p_user_id" "uuid", "p_decision" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_review_listing"("p_listing_id" "uuid", "p_decision" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_review_listing"("p_listing_id" "uuid", "p_decision" "text", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_review_mover_application"("p_user_id" "uuid", "p_decision" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_review_mover_application"("p_user_id" "uuid", "p_decision" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."build_email_html"("p_title" "text", "p_body" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."build_email_html"("p_title" "text", "p_body" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."build_email_html"("p_title" "text", "p_body" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_mover_quote"("p_mover_id" "uuid", "p_distance_km" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_mover_quote"("p_mover_id" "uuid", "p_distance_km" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_mover_quote"("p_mover_id" "uuid", "p_distance_km" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_pms"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_pms"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_pms"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_pms_listing"("p_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_pms_listing"("p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_pms_listing"("p_listing_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_moving_booking"("p_booking_id" "uuid", "p_reason_code" "text", "p_reason_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_moving_booking"("p_booking_id" "uuid", "p_reason_code" "text", "p_reason_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_moving_booking"("p_booking_id" "uuid", "p_reason_code" "text", "p_reason_text" "text") TO "service_role";



GRANT ALL ON TABLE "public"."renter_unit_associations" TO "anon";
GRANT ALL ON TABLE "public"."renter_unit_associations" TO "authenticated";
GRANT ALL ON TABLE "public"."renter_unit_associations" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_renter_invitation"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_renter_invitation"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_renter_invitation"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_expired_unverified_profiles"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_expired_unverified_profiles"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_moving_delivery"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_moving_delivery"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_moving_delivery"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_moving_schedule"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_moving_schedule"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_moving_schedule"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_rent_payment"("p_submission_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_rent_payment"("p_submission_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_rent_payment"("p_submission_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_listing_payment_intent"("p_listing_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_listing_payment_intent"("p_listing_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_listing_payment_intent"("p_listing_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_paypal_subscription_pending"("p_plan_id" "uuid", "p_billing_cycle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_paypal_subscription_pending"("p_plan_id" "uuid", "p_billing_cycle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_paypal_subscription_pending"("p_plan_id" "uuid", "p_billing_cycle" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_real_estate_subscription_checkout"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_phone_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_real_estate_subscription_checkout"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_phone_number" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_real_estate_subscription_checkout"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_phone_number" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_rent_invoice"("p_unit_id" "uuid", "p_periods" "jsonb", "p_due_date" "date", "p_payment_method_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_rent_invoice"("p_unit_id" "uuid", "p_periods" "jsonb", "p_due_date" "date", "p_payment_method_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_rent_invoice"("p_unit_id" "uuid", "p_periods" "jsonb", "p_due_date" "date", "p_payment_method_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_rent_payment_intent"("p_renter_assoc_id" "uuid", "p_periods" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_rent_payment_intent"("p_renter_assoc_id" "uuid", "p_periods" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_rent_payment_intent"("p_renter_assoc_id" "uuid", "p_periods" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_renter_invitation"("p_unit_id" "uuid", "p_renter_name" "text", "p_renter_phone" "text", "p_renter_email" "text", "p_app_base_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_renter_invitation"("p_unit_id" "uuid", "p_renter_name" "text", "p_renter_phone" "text", "p_renter_email" "text", "p_app_base_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_renter_invitation"("p_unit_id" "uuid", "p_renter_name" "text", "p_renter_phone" "text", "p_renter_email" "text", "p_app_base_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_role_aware_listing"("p_title" "text", "p_description" "text", "p_city" "text", "p_county" "text", "p_location_search" "text", "p_latitude" double precision, "p_longitude" double precision, "p_property_name" "text", "p_property_type" "text", "p_price_kes" numeric, "p_listing_type" "text", "p_deposit_required" boolean, "p_deposit_structure" "text", "p_deposit_amount" numeric, "p_size" "text", "p_beds" integer, "p_baths" integer, "p_contact_phone" "text", "p_contact_email" "text", "p_social_links" "jsonb", "p_booking_enabled" boolean, "p_payment_enabled" boolean, "p_is_property_management" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_role_aware_listing"("p_title" "text", "p_description" "text", "p_city" "text", "p_county" "text", "p_location_search" "text", "p_latitude" double precision, "p_longitude" double precision, "p_property_name" "text", "p_property_type" "text", "p_price_kes" numeric, "p_listing_type" "text", "p_deposit_required" boolean, "p_deposit_structure" "text", "p_deposit_amount" numeric, "p_size" "text", "p_beds" integer, "p_baths" integer, "p_contact_phone" "text", "p_contact_email" "text", "p_social_links" "jsonb", "p_booking_enabled" boolean, "p_payment_enabled" boolean, "p_is_property_management" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_role_aware_listing"("p_title" "text", "p_description" "text", "p_city" "text", "p_county" "text", "p_location_search" "text", "p_latitude" double precision, "p_longitude" double precision, "p_property_name" "text", "p_property_type" "text", "p_price_kes" numeric, "p_listing_type" "text", "p_deposit_required" boolean, "p_deposit_structure" "text", "p_deposit_amount" numeric, "p_size" "text", "p_beds" integer, "p_baths" integer, "p_contact_phone" "text", "p_contact_email" "text", "p_social_links" "jsonb", "p_booking_enabled" boolean, "p_payment_enabled" boolean, "p_is_property_management" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_subscription_checkout"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_phone_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_subscription_checkout"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_phone_number" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_subscription_checkout"("p_plan_id" "uuid", "p_billing_cycle" "text", "p_phone_number" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."dispatch_user_notification"("p_user_id" "uuid", "p_notification_type" "text", "p_title" "text", "p_message" "text", "p_data" "jsonb", "p_event_key" "text", "p_send_email" boolean, "p_email_template" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_user_notification"("p_user_id" "uuid", "p_notification_type" "text", "p_title" "text", "p_message" "text", "p_data" "jsonb", "p_event_key" "text", "p_send_email" boolean, "p_email_template" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_property_unit_entitlement"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_property_unit_entitlement"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_mover_payout_for_paid_booking"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_mover_payout_for_paid_booking"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_mover_requests"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_mover_requests"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_mover_payout"("p_payout_id" "uuid", "p_provider" "text", "p_provider_reference" "text", "p_provider_transaction_id" "text", "p_success" boolean, "p_failure_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_mover_payout"("p_payout_id" "uuid", "p_provider" "text", "p_provider_reference" "text", "p_provider_transaction_id" "text", "p_success" boolean, "p_failure_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_paypal_recurring_payment"("p_subscription_id" "text", "p_provider_transaction_id" "text", "p_amount_usd" numeric, "p_webhook_event_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_paypal_recurring_payment"("p_subscription_id" "text", "p_provider_transaction_id" "text", "p_amount_usd" numeric, "p_webhook_event_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_subscription_payment"("p_checkout_request_id" "text", "p_merchant_request_id" "text", "p_result_code" integer, "p_result_description" "text", "p_mpesa_receipt" "text", "p_paid_amount" numeric, "p_phone_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_subscription_payment"("p_checkout_request_id" "text", "p_merchant_request_id" "text", "p_result_code" integer, "p_result_description" "text", "p_mpesa_receipt" "text", "p_paid_amount" numeric, "p_phone_number" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_subscription_paypal_payment"("p_invoice_id" "uuid", "p_order_id" "text", "p_capture_id" "text", "p_amount_usd" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_subscription_paypal_payment"("p_invoice_id" "uuid", "p_order_id" "text", "p_capture_id" "text", "p_amount_usd" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_signup_otp"("p_email" "text", "p_full_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_signup_otp"("p_email" "text", "p_full_name" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."generate_signup_otp"("p_email" "text", "p_full_name" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."generate_signup_otp"("p_email" "text", "p_full_name" "text", "p_encryption_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_signup_otp"("p_email" "text", "p_full_name" "text", "p_encryption_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_active_moving_location"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_active_moving_location"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_moving_location"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_current_landlord_subscription"("p_landlord_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_current_landlord_subscription"("p_landlord_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_current_landlord_subscription"("p_landlord_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_current_real_estate_subscription"("p_real_estate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_current_real_estate_subscription"("p_real_estate_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_current_real_estate_subscription"("p_real_estate_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_landlord_listing_entitlement"("p_landlord_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_landlord_listing_entitlement"("p_landlord_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_landlord_listing_entitlement"("p_landlord_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_mover_booking_detail"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_mover_booking_detail"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_mover_booking_detail"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_mover_quote"("p_mover_id" "uuid", "p_distance_km" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_mover_quote"("p_mover_id" "uuid", "p_distance_km" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_mover_quote"("p_mover_id" "uuid", "p_distance_km" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_mover_schedule_availability"("p_booking_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_mover_schedule_availability"("p_booking_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_mover_schedule_availability"("p_booking_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_mover_tracking_booking"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_mover_tracking_booking"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_mover_tracking_booking"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_available_pms_listings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_available_pms_listings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_available_pms_listings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_landlord_payment_methods"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_landlord_payment_methods"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_landlord_payment_methods"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_pms_listings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_pms_listings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_pms_listings"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_pms_subscription"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_pms_subscription"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_pms_subscription"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_pms_unit_count"("p_subscription_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_pms_unit_count"("p_subscription_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_pms_unit_count"("p_subscription_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_pms_units"("p_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_pms_units"("p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_pms_units"("p_listing_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_rent_payable_periods"("p_assoc_id" "uuid", "p_requested_months" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_rent_payable_periods"("p_assoc_id" "uuid", "p_requested_months" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_rent_payable_periods"("p_assoc_id" "uuid", "p_requested_months" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_rent_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_rent_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_rent_summary"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_renter_associations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_renter_associations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_renter_associations"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_subscription_access"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_subscription_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_subscription_access"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_real_estate_listing_entitlement"("p_real_estate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_real_estate_listing_entitlement"("p_real_estate_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_real_estate_listing_entitlement"("p_real_estate_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_rent_payment_destination"("p_payment_method_id" "uuid", "p_unit_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_rent_payment_destination"("p_payment_method_id" "uuid", "p_unit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rent_payment_destination"("p_payment_method_id" "uuid", "p_unit_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_rent_payments_for_assoc"("p_assoc_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_rent_payments_for_assoc"("p_assoc_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rent_payments_for_assoc"("p_assoc_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_renter_invitation_preview"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_renter_invitation_preview"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_renter_invitation_preview"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_renter_payment_history"("p_assoc_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_renter_payment_history"("p_assoc_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_renter_payment_history"("p_assoc_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_renter_rent_summary"("p_renter_assoc_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_renter_rent_summary"("p_renter_assoc_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_renter_rent_summary"("p_renter_assoc_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_signup_otp_for_email"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_signup_otp_for_email"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_signup_otp_for_email"("p_email" "text", "p_encryption_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_signup_otp_for_email"("p_email" "text", "p_encryption_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_auth_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_current_user_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_current_user_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_current_user_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_listing_pms_managed"("p_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_listing_pms_managed"("p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_listing_pms_managed"("p_listing_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_signup_otp"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_signup_otp"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."issue_signup_otp"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_signup_otp"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_unit_rent_paid_through"("p_unit_id" "uuid", "p_paid_through_month" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_unit_rent_paid_through"("p_unit_id" "uuid", "p_paid_through_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_unit_rent_paid_through"("p_unit_id" "uuid", "p_paid_through_month" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."moving_day_name"("p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."moving_day_name"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."moving_day_name"("p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_application_decision"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_application_decision"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_listing_approved"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_listing_approved"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_listing_posted"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_listing_posted"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."open_moving_dispute"("p_booking_id" "uuid", "p_reason_code" "text", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."open_moving_dispute"("p_booking_id" "uuid", "p_reason_code" "text", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."open_moving_dispute"("p_booking_id" "uuid", "p_reason_code" "text", "p_description" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_listing_payment"("p_payment_id" "uuid", "p_checkout_request_id" "text", "p_paid_amount" numeric, "p_mpesa_receipt" "text", "p_merchant_request_id" "text", "p_phone_number" "text", "p_result_code" integer, "p_result_description" "text", "p_provider" "text", "p_payment_method" "text", "p_provider_reference" "text", "p_payment_intent_id" "uuid", "p_provider_amount" numeric, "p_provider_currency" "text", "p_paypal_order_id" "text", "p_paypal_fx_rate" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_listing_payment"("p_payment_id" "uuid", "p_checkout_request_id" "text", "p_paid_amount" numeric, "p_mpesa_receipt" "text", "p_merchant_request_id" "text", "p_phone_number" "text", "p_result_code" integer, "p_result_description" "text", "p_provider" "text", "p_payment_method" "text", "p_provider_reference" "text", "p_payment_intent_id" "uuid", "p_provider_amount" numeric, "p_provider_currency" "text", "p_paypal_order_id" "text", "p_paypal_fx_rate" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_pms_growth_notifications"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_pms_growth_notifications"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_real_estate_subscription_payment"("p_invoice_id" "uuid", "p_checkout_request_id" "text", "p_mpesa_receipt" "text", "p_merchant_request_id" "text", "p_phone_number" "text", "p_result_code" integer, "p_result_description" "text", "p_paid_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_real_estate_subscription_payment"("p_invoice_id" "uuid", "p_checkout_request_id" "text", "p_mpesa_receipt" "text", "p_merchant_request_id" "text", "p_phone_number" "text", "p_result_code" integer, "p_result_description" "text", "p_paid_amount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_rent_payment"("p_payment_intent_id" "uuid", "p_provider" "text", "p_payment_method" "text", "p_paid_amount" numeric, "p_provider_reference" "text", "p_provider_amount" numeric, "p_provider_currency" "text", "p_mpesa_receipt" "text", "p_checkout_request_id" "text", "p_merchant_request_id" "text", "p_phone_number" "text", "p_result_code" integer, "p_result_description" "text", "p_paypal_order_id" "text", "p_paypal_fx_rate" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_rent_payment"("p_payment_intent_id" "uuid", "p_provider" "text", "p_payment_method" "text", "p_paid_amount" numeric, "p_provider_reference" "text", "p_provider_amount" numeric, "p_provider_currency" "text", "p_mpesa_receipt" "text", "p_checkout_request_id" "text", "p_merchant_request_id" "text", "p_phone_number" "text", "p_result_code" integer, "p_result_description" "text", "p_paypal_order_id" "text", "p_paypal_fx_rate" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_subscription_expiry"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_subscription_expiry"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_subscription_payment"("p_invoice_id" "uuid", "p_checkout_request_id" "text", "p_mpesa_receipt" "text", "p_merchant_request_id" "text", "p_phone_number" "text", "p_result_code" integer, "p_result_description" "text", "p_paid_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_subscription_payment"("p_invoice_id" "uuid", "p_checkout_request_id" "text", "p_mpesa_receipt" "text", "p_merchant_request_id" "text", "p_phone_number" "text", "p_result_code" integer, "p_result_description" "text", "p_paid_amount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."propose_moving_schedule"("p_booking_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."propose_moving_schedule"("p_booking_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."propose_moving_schedule"("p_booking_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_listing_admin_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_listing_admin_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_listing_payment_creation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_listing_payment_creation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_mover_admin_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_mover_admin_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_mover_application_admin_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_mover_application_admin_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_profile_kyc_verification_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_profile_kyc_verification_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_profile_role_transition"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_profile_role_transition"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."publish_approved_listing_to_community"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_approved_listing_to_community"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_notification_email"("p_recipient" "text", "p_subject" "text", "p_html_body" "text", "p_template_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_notification_email"("p_recipient" "text", "p_subject" "text", "p_html_body" "text", "p_template_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_payment_success_notifications"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_payment_success_notifications"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_subscription_payment_notifications"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_subscription_payment_notifications"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_mover_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision, "p_accuracy_meters" double precision, "p_speed_kph" double precision, "p_heading_degrees" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_mover_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision, "p_accuracy_meters" double precision, "p_speed_kph" double precision, "p_heading_degrees" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_mover_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision, "p_accuracy_meters" double precision, "p_speed_kph" double precision, "p_heading_degrees" double precision) TO "service_role";



GRANT ALL ON TABLE "public"."moving_tracking_points" TO "service_role";
GRANT SELECT ON TABLE "public"."moving_tracking_points" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_moving_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision, "p_accuracy_meters" double precision, "p_speed_kph" double precision, "p_heading_degrees" double precision, "p_recorded_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_moving_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision, "p_accuracy_meters" double precision, "p_speed_kph" double precision, "p_heading_degrees" double precision, "p_recorded_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_moving_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision, "p_accuracy_meters" double precision, "p_speed_kph" double precision, "p_heading_degrees" double precision, "p_recorded_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_moving_payment"("p_booking_id" "uuid", "p_provider" "text", "p_provider_reference" "text", "p_provider_transaction_id" "text", "p_amount_kes" numeric, "p_mpesa_receipt" "text", "p_paypal_order_id" "text", "p_provider_currency" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_moving_payment"("p_booking_id" "uuid", "p_provider" "text", "p_provider_reference" "text", "p_provider_transaction_id" "text", "p_amount_kes" numeric, "p_mpesa_receipt" "text", "p_paypal_order_id" "text", "p_provider_currency" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_rent_payment"("p_submission_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_rent_payment"("p_submission_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_rent_payment"("p_submission_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_listing_from_pms"("p_subscription_id" "uuid", "p_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_listing_from_pms"("p_subscription_id" "uuid", "p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_listing_from_pms"("p_subscription_id" "uuid", "p_listing_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_mover_booking"("p_mover_id" "uuid", "p_pickup_address" "text", "p_dropoff_address" "text", "p_pickup_latitude" double precision, "p_pickup_longitude" double precision, "p_dropoff_latitude" double precision, "p_dropoff_longitude" double precision, "p_distance_km" numeric, "p_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_mover_booking"("p_mover_id" "uuid", "p_pickup_address" "text", "p_dropoff_address" "text", "p_pickup_latitude" double precision, "p_pickup_longitude" double precision, "p_dropoff_latitude" double precision, "p_dropoff_longitude" double precision, "p_distance_km" numeric, "p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_mover_booking"("p_mover_id" "uuid", "p_pickup_address" "text", "p_dropoff_address" "text", "p_pickup_latitude" double precision, "p_pickup_longitude" double precision, "p_dropoff_latitude" double precision, "p_dropoff_longitude" double precision, "p_distance_km" numeric, "p_listing_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resend_renter_invitation"("p_association_id" "uuid", "p_app_base_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resend_renter_invitation"("p_association_id" "uuid", "p_app_base_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resend_renter_invitation"("p_association_id" "uuid", "p_app_base_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_moving_dispute"("p_dispute_id" "uuid", "p_resolution_code" "text", "p_resolution_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_moving_dispute"("p_dispute_id" "uuid", "p_resolution_code" "text", "p_resolution_notes" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."resolve_moving_dispute"("p_dispute_id" "uuid", "p_resolution_code" "text", "p_resolution_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."respond_to_mover_booking"("p_booking_id" "uuid", "p_decision" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_to_mover_booking"("p_booking_id" "uuid", "p_decision" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_mover_booking"("p_booking_id" "uuid", "p_decision" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_mover_after_delivery"("p_booking_id" "uuid", "p_rating" integer, "p_comment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_mover_after_delivery"("p_booking_id" "uuid", "p_rating" integer, "p_comment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_mover_after_delivery"("p_booking_id" "uuid", "p_rating" integer, "p_comment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_payment_reminder"("p_renter_assoc_id" "uuid", "p_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."send_payment_reminder"("p_renter_assoc_id" "uuid", "p_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_payment_reminder"("p_renter_assoc_id" "uuid", "p_message" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_booking_mover_pricing"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_booking_mover_pricing"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_landlord_payment_method_default"("p_payment_method_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_landlord_payment_method_default"("p_payment_method_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_landlord_payment_method_default"("p_payment_method_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_otp_verifications_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_otp_verifications_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_platform_settings_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_platform_settings_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_subscription_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_subscription_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_moving_journey"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_moving_journey"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_moving_journey"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_kyc_application"("p_full_name" "text", "p_national_id" "text", "p_id_photo_url" "text", "p_selfie_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_kyc_application"("p_full_name" "text", "p_national_id" "text", "p_id_photo_url" "text", "p_selfie_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_kyc_application"("p_full_name" "text", "p_national_id" "text", "p_id_photo_url" "text", "p_selfie_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_landlord_application"("p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_email" "text", "p_phone" "text", "p_national_id" "text", "p_document_type" "text", "p_document_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_landlord_application"("p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_email" "text", "p_phone" "text", "p_national_id" "text", "p_document_type" "text", "p_document_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_landlord_application"("p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_email" "text", "p_phone" "text", "p_national_id" "text", "p_document_type" "text", "p_document_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_mover_application"("p_application" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_mover_application"("p_application" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_mover_application"("p_application" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_rent_payment"("p_invoice_id" "uuid", "p_transaction_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_rent_payment"("p_invoice_id" "uuid", "p_transaction_reference" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_rent_payment"("p_invoice_id" "uuid", "p_transaction_reference" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_mover_profile_application_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_mover_profile_application_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_renter_assoc_rent_from_unit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_renter_assoc_rent_from_unit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_listing_payment_intent_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_listing_payment_intent_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_moving_payment_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_moving_payment_state"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_rent_payment_relationship"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_rent_payment_relationship"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_renter_unit_association"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_renter_unit_association"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_signup_otp"("p_email" "text", "p_otp" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_signup_otp"("p_email" "text", "p_otp" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."verify_signup_otp"("p_email" "text", "p_otp" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_signup_otp"("p_email" "text", "p_otp" "text") TO "anon";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."booking_events" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."booking_events" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_events" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."community_posts" TO "anon";
GRANT ALL ON TABLE "public"."community_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."community_posts" TO "service_role";



GRANT ALL ON TABLE "public"."exchange_rate_cache" TO "service_role";



GRANT ALL ON TABLE "public"."landlord_payment_methods" TO "anon";
GRANT ALL ON TABLE "public"."landlord_payment_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."landlord_payment_methods" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."landlord_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."landlord_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."listing_media" TO "anon";
GRANT ALL ON TABLE "public"."listing_media" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_media" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."listing_payment_intents" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."listing_payment_intents" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_payment_intents" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."listing_payments" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."listing_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_payments" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."listings" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."listings" TO "authenticated";
GRANT ALL ON TABLE "public"."listings" TO "service_role";



GRANT ALL ON TABLE "public"."mover_applications" TO "anon";
GRANT ALL ON TABLE "public"."mover_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."mover_applications" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."mover_payouts" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."mover_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."mover_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."mover_schedule_events" TO "service_role";
GRANT SELECT ON TABLE "public"."mover_schedule_events" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."movers" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."movers" TO "authenticated";
GRANT ALL ON TABLE "public"."movers" TO "service_role";



GRANT ALL ON TABLE "public"."moving_cancellation_events" TO "service_role";
GRANT SELECT ON TABLE "public"."moving_cancellation_events" TO "authenticated";



GRANT ALL ON TABLE "public"."moving_disputes" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."moving_disputes" TO "authenticated";
GRANT ALL ON TABLE "public"."moving_disputes" TO "service_role";



GRANT ALL ON TABLE "public"."moving_invoices" TO "service_role";
GRANT SELECT ON TABLE "public"."moving_invoices" TO "authenticated";



GRANT ALL ON TABLE "public"."moving_payments" TO "service_role";
GRANT SELECT ON TABLE "public"."moving_payments" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."moving_tracking_points_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."moving_tracking_points_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."moving_tracking_points_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notification_emails" TO "service_role";



GRANT ALL ON TABLE "public"."payment_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."platform_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";



GRANT ALL ON TABLE "public"."pms_subscription_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."property_units" TO "anon";
GRANT ALL ON TABLE "public"."property_units" TO "authenticated";
GRANT ALL ON TABLE "public"."property_units" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."real_estate_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."real_estate_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."rent_invoice_periods" TO "anon";
GRANT ALL ON TABLE "public"."rent_invoice_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."rent_invoice_periods" TO "service_role";



GRANT ALL ON TABLE "public"."rent_invoices" TO "anon";
GRANT ALL ON TABLE "public"."rent_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."rent_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."rent_payment_intents" TO "anon";
GRANT ALL ON TABLE "public"."rent_payment_intents" TO "authenticated";
GRANT ALL ON TABLE "public"."rent_payment_intents" TO "service_role";



GRANT ALL ON TABLE "public"."rent_payment_submissions" TO "anon";
GRANT ALL ON TABLE "public"."rent_payment_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."rent_payment_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."rent_payments" TO "anon";
GRANT ALL ON TABLE "public"."rent_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."rent_payments" TO "service_role";



GRANT ALL ON TABLE "public"."rent_reminder_settings" TO "anon";
GRANT ALL ON TABLE "public"."rent_reminder_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."rent_reminder_settings" TO "service_role";



GRANT ALL ON TABLE "public"."rent_reminders" TO "anon";
GRANT ALL ON TABLE "public"."rent_reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."rent_reminders" TO "service_role";



GRANT ALL ON TABLE "public"."renter_notifications" TO "anon";
GRANT ALL ON TABLE "public"."renter_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."renter_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."subscription_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_invoices" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."subscription_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_listings" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."subscription_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plans" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_renewal_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."support_tickets" TO "anon";
GRANT ALL ON TABLE "public"."support_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."support_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."terms_acceptance" TO "anon";
GRANT ALL ON TABLE "public"."terms_acceptance" TO "authenticated";
GRANT ALL ON TABLE "public"."terms_acceptance" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."user_notifications" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."user_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notifications" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







