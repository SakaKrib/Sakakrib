from pathlib import Path
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'dev-only-secret-key')
DEBUG = os.getenv('DJANGO_DEBUG', 'true').lower() == 'true'
ALLOWED_HOSTS = [h.strip() for h in os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1,backend,100.109.224.0').split(',') if h.strip()]

INSTALLED_APPS = [
    'daphne',
    'corsheaders',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'channels',
    'apps.accounts',
    'apps.core',
    'apps.listings',
    'apps.payments',
    'apps.subscriptions',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
]

ROOT_URLCONF = 'config.urls'
ASGI_APPLICATION = 'config.asgi.application'
WSGI_APPLICATION = 'config.wsgi.application'

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [BASE_DIR / 'templates'],
    'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('POSTGRES_DB', 'sakakrib'),
        'USER': os.getenv('POSTGRES_USER', 'sakakrib'),
        'PASSWORD': os.getenv('POSTGRES_PASSWORD', 'sakakrib'),
        'HOST': os.getenv('POSTGRES_HOST', 'postgres'),
        'PORT': os.getenv('POSTGRES_PORT', '5432'),
    }
}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = os.getenv('DJANGO_TIME_ZONE', 'Africa/Nairobi')
USE_I18N = True
USE_TZ = True
STATIC_URL = 'static/'
MEDIA_ROOT = Path(os.getenv('DJANGO_MEDIA_ROOT', BASE_DIR / 'media'))
MEDIA_URL = '/media/'
CHAT_ATTACHMENT_BASE_URL = os.getenv('CHAT_ATTACHMENT_BASE_URL', '')
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', SECRET_KEY)
JWT_ALGORITHM = 'HS256'
JWT_ISSUER = os.getenv('JWT_ISSUER', 'sakakrib-django')
JWT_AUDIENCE = os.getenv('JWT_AUDIENCE', 'sakakrib-api')
JWT_ACCESS_LIFETIME_SECONDS = int(os.getenv('JWT_ACCESS_LIFETIME_SECONDS', '300'))
JWT_REFRESH_LIFETIME_SECONDS = int(os.getenv('JWT_REFRESH_LIFETIME_SECONDS', '604800'))
JWT_ACCESS_COOKIE = os.getenv('JWT_ACCESS_COOKIE', 'sakakrib_access')
JWT_REFRESH_COOKIE = os.getenv('JWT_REFRESH_COOKIE', 'sakakrib_refresh')
JWT_COOKIE_SECURE = os.getenv('JWT_COOKIE_SECURE', 'false').lower() == 'true'
JWT_COOKIE_SAMESITE = os.getenv('JWT_COOKIE_SAMESITE', 'Lax')
JWT_COOKIE_DOMAIN = os.getenv('JWT_COOKIE_DOMAIN') or None
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['apps.accounts.authentication.CookieJWTAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
}

# Include the LAN frontend origin in the development defaults. The frontend
# and backend use different ports, so credentialed requests still require an
# explicit CORS origin even though they share the same host.
CORS_ALLOWED_ORIGINS = [o.strip() for o in os.getenv(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173,http://100.109.224.0:5173',
).split(',') if o.strip()]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.getenv(
    'CSRF_TRUSTED_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173,http://100.109.224.0:5173',
).split(',') if o.strip()]
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = os.getenv('CSRF_COOKIE_SAMESITE', 'Lax')
CSRF_COOKIE_SECURE = os.getenv('CSRF_COOKIE_SECURE', 'false').lower() == 'true'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = os.getenv('SESSION_COOKIE_SAMESITE', 'Lax')
SESSION_COOKIE_SECURE = os.getenv('SESSION_COOKIE_SECURE', 'false').lower() == 'true'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST = os.getenv('EMAIL_HOST', '')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'true').lower() == 'true'
EMAIL_USE_SSL = os.getenv('EMAIL_USE_SSL', 'false').lower() == 'true'
EMAIL_TIMEOUT = int(os.getenv('EMAIL_TIMEOUT', '20'))
EMAIL_FROM = os.getenv('EMAIL_FROM', os.getenv('DEFAULT_FROM_EMAIL', ''))
DEFAULT_FROM_EMAIL = EMAIL_FROM or EMAIL_HOST_USER
ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', '')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
LISTING_FREE_LIMIT = int(os.getenv('LISTING_FREE_LIMIT', '3'))
INDIVIDUAL_LISTING_PRICE_KES = int(os.getenv('INDIVIDUAL_LISTING_PRICE_KES', '1000'))
MPESA_CONSUMER_KEY = os.getenv('MPESA_CONSUMER_KEY', '')
MPESA_CONSUMER_SECRET = os.getenv('MPESA_CONSUMER_SECRET', '')
MPESA_SHORTCODE = os.getenv('MPESA_SHORTCODE', '')
MPESA_PASSKEY = os.getenv('MPESA_PASSKEY', '')
MPESA_CALLBACK_URL = os.getenv('MPESA_CALLBACK_URL', '')
MPESA_BASE_URL = os.getenv('MPESA_BASE_URL', 'https://sandbox.safaricom.co.ke')
MPESA_PAYOUT_CALLBACK_SECRET = os.getenv('MPESA_PAYOUT_CALLBACK_SECRET', '')
PAYPAL_CLIENT_ID = os.getenv('PAYPAL_CLIENT_ID', '')
PAYPAL_CLIENT_SECRET = os.getenv('PAYPAL_CLIENT_SECRET', '')
PAYPAL_BASE_URL = os.getenv('PAYPAL_BASE_URL', 'https://api-m.sandbox.paypal.com')
PAYPAL_WEBHOOK_ID = os.getenv('PAYPAL_WEBHOOK_ID', '')
PAYPAL_LISTING_WEBHOOK_ID = os.getenv('PAYPAL_LISTING_WEBHOOK_ID', '')
PAYPAL_SUBSCRIPTION_RETURN_URL_LOCAL = os.getenv('PAYPAL_SUBSCRIPTION_RETURN_URL_LOCAL', 'http://localhost:5173/paypal/subscription/return')
PAYPAL_SUBSCRIPTION_CANCEL_URL_LOCAL = os.getenv('PAYPAL_SUBSCRIPTION_CANCEL_URL_LOCAL', 'http://localhost:5173/paypal/subscription/cancel')
PAYPAL_SUBSCRIPTION_RETURN_URL_NETWORK = os.getenv('PAYPAL_SUBSCRIPTION_RETURN_URL_NETWORK', 'http://100.109.224.0:5173/paypal/subscription/return')
PAYPAL_SUBSCRIPTION_CANCEL_URL_NETWORK = os.getenv('PAYPAL_SUBSCRIPTION_CANCEL_URL_NETWORK', 'http://100.109.224.0:5173/paypal/subscription/cancel')
PAYPAL_SUBSCRIPTION_RETURN_URL_MODE = os.getenv('PAYPAL_SUBSCRIPTION_RETURN_URL_MODE', 'LOCAL').upper()
if PAYPAL_SUBSCRIPTION_RETURN_URL_MODE == 'NETWORK':
    PAYPAL_SUBSCRIPTION_RETURN_URL = PAYPAL_SUBSCRIPTION_RETURN_URL_NETWORK
    PAYPAL_SUBSCRIPTION_CANCEL_URL = PAYPAL_SUBSCRIPTION_CANCEL_URL_NETWORK
else:
    PAYPAL_SUBSCRIPTION_RETURN_URL = PAYPAL_SUBSCRIPTION_RETURN_URL_LOCAL
    PAYPAL_SUBSCRIPTION_CANCEL_URL = PAYPAL_SUBSCRIPTION_CANCEL_URL_LOCAL
MOVING_PAYPAL_WEBHOOK_ID = os.getenv('MOVING_PAYPAL_WEBHOOK_ID', '')
EXCHANGE_RATE_API_KEY = os.getenv('EXCHANGE_RATE_API_KEY', os.getenv('EXCHANGERATE_API_KEY', ''))
EXCHANGE_RATE_API_BASE_URL = os.getenv('EXCHANGE_RATE_API_BASE_URL', os.getenv('EXCHANGERATE_API_BASE_URL', 'https://v6.exchangerate-api.com/v6'))
EXCHANGERATE_API_KEY = EXCHANGE_RATE_API_KEY
EXCHANGERATE_API_BASE_URL = EXCHANGE_RATE_API_BASE_URL

CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', 'redis://redis:6379/0')
CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', 'redis://redis:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
