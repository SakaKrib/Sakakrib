from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Profile


@admin.register(Profile)
class ProfileAdmin(UserAdmin):
    model = Profile
    ordering = ('-created_at',)
    list_display = (
        'email',
        'role',
        'verification_status',
        'landlord_application_status',
        'real_estate_application_status',
        'mover_application_status',
        'is_active',
        'is_staff',
    )
    list_filter = ('role', 'verification_status', 'is_active', 'is_staff', 'is_admin')
    search_fields = ('email', 'full_name', 'phone', 'national_id')
    readonly_fields = ('created_at', 'updated_at', 'date_joined', 'last_login')
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Identity', {'fields': ('full_name', 'first_name', 'middle_name', 'last_name', 'phone')}),
        ('Application', {
            'fields': (
                'role',
                'verification_status',
                'kyc_completed',
                'landlord_application_status',
                'real_estate_application_status',
                'mover_application_status',
                'admin_review_note',
            )
        }),
        ('Documents', {
            'fields': (
                'national_id',
                'dl_number',
                'profile_photo_url',
                'id_photo_url',
                'selfie_url',
                'id_document_url',
                'id_document_type',
            )
        }),
        ('Location', {'fields': ('city', 'county', 'is_agency')}),
        ('Listings', {'fields': ('free_listings_used',)}),
        ('Permissions', {'fields': ('is_admin', 'is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Dates', {'fields': ('last_login', 'date_joined', 'created_at', 'updated_at')}),
    )
    add_fieldsets = (
        (
            None,
            {
                'classes': ('wide',),
                'fields': ('email', 'password1', 'password2', 'is_active', 'is_staff', 'is_superuser'),
            },
        ),
    )
