from django import forms
from django.contrib import admin
from django.contrib.auth.forms import ReadOnlyPasswordHashField

from .models import Profile


class ProfileCreationForm(forms.ModelForm):
    password1 = forms.CharField(label='Password', widget=forms.PasswordInput)
    password2 = forms.CharField(label='Password confirmation', widget=forms.PasswordInput)

    class Meta:
        model = Profile
        fields = ('email',)

    def clean_password2(self):
        password1 = self.cleaned_data.get('password1')
        password2 = self.cleaned_data.get('password2')
        if password1 and password2 and password1 != password2:
            raise forms.ValidationError('Passwords do not match.')
        return password2

    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data['password1'])
        if commit:
            user.save()
        return user


class ProfileChangeForm(forms.ModelForm):
    password = ReadOnlyPasswordHashField(label='Password')

    class Meta:
        model = Profile
        fields = '__all__'


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    add_form = ProfileCreationForm
    form = ProfileChangeForm
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
