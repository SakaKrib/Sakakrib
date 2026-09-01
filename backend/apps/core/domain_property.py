import uuid
from django.contrib.postgres.fields import ArrayField
from django.db import models

class LandlordPaymentMethod(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); landlord_id=models.UUIDField(); provider=models.TextField(); mpesa_method=models.TextField(null=True,blank=True); display_name=models.TextField(); paybill_number=models.TextField(null=True,blank=True); paybill_account=models.TextField(null=True,blank=True); till_number=models.TextField(null=True,blank=True); paypal_email=models.TextField(null=True,blank=True); is_default=models.BooleanField(default=False); is_active=models.BooleanField(default=True); created_at=models.DateTimeField(auto_now_add=True); updated_at=models.DateTimeField(auto_now=True)
    class Meta: db_table='landlord_payment_methods'

class PropertyUnit(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); listing_id=models.UUIDField(); user_id=models.UUIDField(); unit_number=models.TextField(); unit_type=models.TextField(); rent=models.DecimalField(max_digits=14,decimal_places=2); deposit_amount=models.DecimalField(max_digits=14,decimal_places=2,default=0); size=models.TextField(null=True,blank=True); beds=models.IntegerField(default=1); baths=models.IntegerField(default=1); availability=models.TextField(default='available'); description=models.TextField(null=True,blank=True); position=models.IntegerField(default=0); created_at=models.DateTimeField(auto_now_add=True); updated_at=models.DateTimeField(auto_now=True); payment_tracking_enabled=models.BooleanField(default=True); rent_due_day=models.SmallIntegerField(default=1); rent_paid_in_advance=models.BooleanField(default=False); rent_paid_through_month=models.DateField(null=True,blank=True)
    class Meta: db_table='property_units'

class RenterUnitAssociation(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); unit_id=models.UUIDField(); landlord_id=models.UUIDField(); renter_name=models.TextField(); renter_phone=models.TextField(null=True,blank=True); renter_email=models.TextField(null=True,blank=True); rent_amount=models.DecimalField(max_digits=14,decimal_places=2); lease_start=models.DateField(null=True,blank=True); lease_end=models.DateField(null=True,blank=True); status=models.TextField(default='ACTIVE'); created_at=models.DateTimeField(auto_now_add=True); updated_at=models.DateTimeField(auto_now=True); renter_user_id=models.UUIDField(null=True,blank=True); invite_token_hash=models.TextField(null=True,blank=True); invited_at=models.DateTimeField(null=True,blank=True); invite_expires_at=models.DateTimeField(null=True,blank=True); claimed_at=models.DateTimeField(null=True,blank=True)
    class Meta: db_table='renter_unit_associations'

class ListingMedia(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); listing_id=models.UUIDField(); user_id=models.UUIDField(); url=models.TextField(); label=models.TextField(default=''); media_type=models.TextField(default='photo'); position=models.IntegerField(default=0); created_at=models.DateTimeField(null=True,blank=True); unit_id=models.UUIDField(null=True,blank=True)
    class Meta: db_table='listing_media'

class ExchangeRateCache(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); base_currency=models.TextField(); quote_currency=models.TextField(); rate=models.DecimalField(max_digits=18,decimal_places=8); source=models.TextField(); fetched_at=models.DateTimeField(auto_now_add=True); expires_at=models.DateTimeField(); created_at=models.DateTimeField(auto_now_add=True)
    class Meta: db_table='exchange_rate_cache'

class PMSSubscriptionNotification(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); landlord_id=models.UUIDField(); subscription_id=models.UUIDField(null=True,blank=True); notification_type=models.TextField(); unit_count=models.IntegerField(); title=models.TextField(); message=models.TextField(); action_type=models.TextField(null=True,blank=True); action_required=models.BooleanField(default=False); email_sent=models.BooleanField(default=False); in_app_read=models.BooleanField(default=False); created_at=models.DateTimeField(auto_now_add=True); read_at=models.DateTimeField(null=True,blank=True)
    class Meta: db_table='pms_subscription_notifications'

class PlatformSettings(models.Model):
    id=models.BooleanField(primary_key=True,default=True); mover_commission_rate=models.DecimalField(max_digits=10,decimal_places=6,default=0.1); mover_operational_markup_rate=models.DecimalField(max_digits=10,decimal_places=6,default=0); created_at=models.DateTimeField(auto_now_add=True); updated_at=models.DateTimeField(auto_now=True)
    class Meta: db_table='platform_settings'

class CommunityPost(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); user_id=models.UUIDField(); listing_id=models.UUIDField(null=True,blank=True); content=models.TextField(default=''); ai_caption=models.TextField(null=True,blank=True,default=''); post_type=models.TextField(default='listing'); created_at=models.DateTimeField(null=True,blank=True)
    class Meta: db_table='community_posts'

class Review(models.Model):
    id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False); reviewer_id=models.UUIDField(); reviewee_id=models.UUIDField(null=True,blank=True); listing_id=models.UUIDField(null=True,blank=True); mover_id=models.UUIDField(null=True,blank=True); rating=models.IntegerField(default=5); comment=models.TextField(default=''); review_type=models.TextField(); created_at=models.DateTimeField(null=True,blank=True); booking_id=models.UUIDField(null=True,blank=True)
    class Meta: db_table='reviews'
