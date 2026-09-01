import uuid

from django.contrib.postgres.fields import ArrayField
from django.db import models


class MoverApplication(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); applicant_id=models.UUIDField(); applicant_email=models.TextField(null=True,blank=True); applicant_name=models.TextField(); application_type=models.TextField(default='mover'); driver_full_name=models.TextField(); national_id=models.TextField(); dl_number=models.TextField(); dl_photo_url=models.TextField(null=True,blank=True); vehicle_type=models.TextField(); number_plate=models.TextField(); capacity_details=models.TextField(); operating_city=models.TextField(); operating_county=models.TextField(); phone=models.TextField(); base_rate_kes=models.DecimalField(max_digits=14,decimal_places=2,default=0); rate_per_km_kes=models.DecimalField(max_digits=14,decimal_places=2,default=0); payment_channel=models.TextField(); payment_account=models.TextField(); insurance_policy_details=models.TextField(); vehicle_inspection_expiry=models.DateField(); liability_accepted=models.BooleanField(default=False); terms_accepted=models.BooleanField(default=False); reference_contacts=models.JSONField(default=list); status=models.TextField(default='pending'); reviewed_by=models.UUIDField(null=True,blank=True); reviewed_at=models.DateTimeField(null=True,blank=True); review_notes=models.TextField(null=True,blank=True); submitted_at=models.DateTimeField(auto_now_add=True); created_at=models.DateTimeField(auto_now_add=True); updated_at=models.DateTimeField(auto_now=True); latitude=models.FloatField(null=True,blank=True); longitude=models.FloatField(null=True,blank=True); location=models.TextField(null=True,blank=True)
    class Meta: db_table='mover_applications'

class Mover(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); user_id=models.UUIDField(); driver_full_name=models.TextField(default=''); national_id=models.TextField(default=''); dl_number=models.TextField(default=''); dl_photo_url=models.TextField(null=True,blank=True,default=''); vehicle_type=models.TextField(default='pickup'); number_plate=models.TextField(default=''); operating_city=models.TextField(default=''); operating_county=models.TextField(default=''); phone=models.TextField(default=''); profile_photo_url=models.TextField(null=True,blank=True,default=''); base_rate_kes=models.DecimalField(max_digits=14,decimal_places=2,default=0); is_available=models.BooleanField(default=True); created_at=models.DateTimeField(null=True,blank=True); updated_at=models.DateTimeField(null=True,blank=True); business_name=models.TextField(null=True,blank=True,default=''); working_days=ArrayField(models.TextField(),default=list,null=True,blank=True); start_time=models.TimeField(null=True,blank=True); end_time=models.TimeField(null=True,blank=True); payment_channel=models.TextField(default='mpesa_send_money'); payment_account=models.TextField(default=''); liability_accepted=models.BooleanField(default=False); reference_contacts=models.JSONField(default=list); approval_status=models.TextField(default='pending_review'); rate_per_km_kes=models.DecimalField(max_digits=14,decimal_places=2,null=True,blank=True,default=0); insurance_policy_details=models.TextField(null=True,blank=True,default=''); vehicle_inspection_expiry=models.DateField(null=True,blank=True); terms_accepted=models.BooleanField(null=True,blank=True,default=False); current_latitude=models.FloatField(null=True,blank=True); current_longitude=models.FloatField(null=True,blank=True); location_updated_at=models.DateTimeField(null=True,blank=True); location=models.TextField(null=True,blank=True); capacity_details=models.TextField(default='')
    class Meta:
        db_table='movers'
        constraints=[
            models.CheckConstraint(condition=models.Q(vehicle_type__in=['pickup','lorry','trailer']),name='movers_vehicle_type_check'),
            models.CheckConstraint(condition=models.Q(payment_channel__in=['mpesa_send_money','mpesa_paybill','mpesa_lipa_na_mpesa','airtel_money']),name='movers_payment_channel_check'),
            models.CheckConstraint(condition=models.Q(approval_status__in=['pending_review','approved','rejected']),name='movers_approval_status_check'),
            models.CheckConstraint(condition=models.Q(current_latitude__isnull=True) | (models.Q(current_latitude__gte=-90) & models.Q(current_latitude__lte=90)),name='movers_current_latitude_range'),
            models.CheckConstraint(condition=models.Q(current_longitude__isnull=True) | (models.Q(current_longitude__gte=-180) & models.Q(current_longitude__lte=180)),name='movers_current_longitude_range'),
            models.UniqueConstraint(fields=['user_id'],name='movers_user_id_key'),
        ]

class NotificationEmail(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); recipient=models.TextField(); subject=models.TextField(); html_body=models.TextField(); template_type=models.TextField(default='generic'); status=models.TextField(default='pending'); created_at=models.DateTimeField(null=True,blank=True); sent_at=models.DateTimeField(null=True,blank=True)
    class Meta: db_table='notification_emails'

class PaymentWebhookEvent(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); provider=models.TextField(); event_id=models.TextField(); event_type=models.TextField(); status=models.TextField(default='RECEIVED'); received_at=models.DateTimeField(auto_now_add=True); processed_at=models.DateTimeField(null=True,blank=True); error=models.TextField(null=True,blank=True); invoice_id=models.UUIDField(null=True,blank=True); metadata=models.JSONField(default=dict)
    class Meta:
        db_table='payment_webhook_events'
        constraints=[
            models.UniqueConstraint(fields=['provider','event_id'],name='payment_webhook_events_provider_event_id_key'),
            models.CheckConstraint(condition=models.Q(status__in=['RECEIVED','PROCESSING','PROCESSED','IGNORED','FAILED']),name='payment_webhook_events_status_check'),
        ]

class UserNotification(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); user_id=models.UUIDField(); notification_type=models.TextField(); title=models.TextField(); message=models.TextField(); data=models.JSONField(default=dict); read_at=models.DateTimeField(null=True,blank=True); created_at=models.DateTimeField(auto_now_add=True); event_key=models.TextField(null=True,blank=True)
    class Meta:
        db_table='user_notifications'
        constraints=[
            models.UniqueConstraint(fields=['event_key'], condition=models.Q(event_key__isnull=False), name='user_notifications_event_key_uidx'),
        ]

class RenterNotification(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); renter_user_id=models.UUIDField(); renter_assoc_id=models.UUIDField(null=True,blank=True); landlord_id=models.UUIDField(null=True,blank=True); notification_type=models.TextField(default='RENT_REMINDER'); title=models.TextField(); body=models.TextField(); action_type=models.TextField(null=True,blank=True); action_payload=models.JSONField(default=dict); read_at=models.DateTimeField(null=True,blank=True); created_at=models.DateTimeField(auto_now_add=True)
    class Meta: db_table='renter_notifications'

class SubscriptionRenewalAttempt(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); subscription_id=models.UUIDField(); attempt_day=models.IntegerField(); checkout_request_id=models.TextField(null=True,blank=True); status=models.TextField(default='INITIATED'); created_at=models.DateTimeField(auto_now_add=True); real_estate_subscription_id=models.UUIDField(null=True,blank=True); payment_provider=models.TextField(null=True,blank=True); provider_reference=models.TextField(null=True,blank=True); provider_transaction_id=models.TextField(null=True,blank=True); failure_reason=models.TextField(null=True,blank=True); completed_at=models.DateTimeField(null=True,blank=True)
    class Meta: db_table='subscription_renewal_attempts'

class SupportTicket(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); user_id=models.UUIDField(null=True,blank=True); full_name=models.TextField(); email=models.TextField(); phone=models.TextField(default=''); subject=models.TextField(); message=models.TextField(); status=models.TextField(default='pending'); admin_reply=models.TextField(default=''); resolved_at=models.DateTimeField(null=True,blank=True); resolved_by=models.UUIDField(null=True,blank=True); created_at=models.DateTimeField(auto_now_add=True); updated_at=models.DateTimeField(auto_now=True)
    class Meta: db_table='support_tickets'

class TermsAcceptance(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); user_id=models.UUIDField(); context=models.TextField(); accepted=models.BooleanField(default=False); accepted_at=models.DateTimeField(null=True,blank=True); created_at=models.DateTimeField(null=True,blank=True)
    class Meta: db_table='terms_acceptance'
