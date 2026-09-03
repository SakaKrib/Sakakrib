import os
from pathlib import Path
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'unsafe-dev-key-change-me')
DEBUG = os.getenv('DJANGO_DEBUG', 'true').lower() == 'true'

# Docker's internal service hostname and the LAN development address are valid
# request hosts for the local stack. Keep any configured hosts and append these
# mandatory local hosts so a stale shell/root .env value cannot remove them.
_configured_hosts = [host.strip() for host in os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if host.strip()]
ALLOWED_HOSTS = list(dict.fromkeys([*_configured_hosts, 'localhost', '127.0.0.1', 'backend', '100.109.224.0']))

INSTALLED_APPS = ['django.contrib.admin','django.contrib.contenttypes','django.contrib.auth','django.contrib.sessions','django.contrib.messages','django.contrib.staticfiles','django.contrib.postgres','corsheaders','rest_framework','channels','apps.core','apps.accounts','apps.listings','apps.subscriptions','apps.payments']
MIDDLEWARE = ['corsheaders.middleware.CorsMiddleware','django.middleware.security.SecurityMiddleware','django.contrib.sessions.middleware.SessionMiddleware','django.middleware.common.CommonMiddleware','django.middleware.csrf.CsrfViewMiddleware','django.contrib.auth.middleware.AuthenticationMiddleware','django.contrib.messages.middleware.MessageMiddleware']
ROOT_URLCONF = 'config.urls'
TEMPLATES = [{'BACKEND':'django.template.backends.django.DjangoTemplates','DIRS':[],'APP_DIRS':True,'OPTIONS':{'context_processors':['django.template.context_processors.request','django.contrib.auth.context_processors.auth','django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'
REDIS_URL = os.getenv('REDIS_URL', '')
if REDIS_URL:
    CHANNEL_LAYERS = {'default': {'BACKEND': 'channels_redis.core.RedisChannelLayer', 'CONFIG': {'hosts': [REDIS_URL]}}}
elif DEBUG:
    CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
else:
    raise ImproperlyConfigured('REDIS_URL is required when DJANGO_DEBUG=false because Channels realtime tracking/chat must use a shared production channel layer.')
CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', REDIS_URL)
CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', REDIS_URL)
CELERY_TIMEZONE = TIME_ZONE = os.getenv('CELERY_TIMEZONE', 'Africa/Nairobi')
CELERY_ENABLE_UTC = True
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_BEAT_SCHEDULE = {
    'generate-recurring-rent-reminders-daily': {'task': 'apps.core.tasks.generate_recurring_rent_reminders', 'schedule': 86400.0},
    'process-due-rent-reminders-every-minute': {'task': 'apps.core.tasks.process_due_rent_reminders', 'schedule': 60.0},
    'process-notification-email-queue-every-minute': {'task': 'apps.core.email_tasks.process_notification_email_queue', 'schedule': 60.0},
    'process-subscription-expiry-every-five-minutes': {'task': 'apps.subscriptions.tasks.process_subscription_expiry_task', 'schedule': 300.0},
}
AUTH_USER_MODEL = 'accounts.Profile'
AUTHENTICATION_BACKENDS = ['apps.accounts.authentication.CookieJWTAuthenticationBackend']
AUTH_PASSWORD_VALIDATORS = [{'NAME':'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},{'NAME':'django.contrib.auth.password_validation.MinimumLengthValidator','OPTIONS':{'min_length':8}},{'NAME':'django.contrib.auth.password_validation.CommonPasswordValidator'},{'NAME':'django.contrib.auth.password_validation.NumericPasswordValidator'}]
DATABASES = {'default': {'ENGINE': 'django.db.backends.postgresql','NAME': os.getenv('DB_NAME','sakakrib'),'USER': os.getenv('DB_USER','sakakrib'),'PASSWORD': os.getenv('DB_PASSWORD',''),'HOST': os.getenv('DB_HOST','127.0.0.1'),'PORT': os.getenv('DB_PORT','5432'),'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE','60')),'OPTIONS': {'sslmode': os.getenv('DB_SSLMODE','prefer')}}}
LANGUAGE_CODE = 'en-us'
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
JWT_ACCESS_LIFETIME_SECONDS = int(os.getenv('JWT_ACCESS_LIFETIME_SECONDS','300'))
JWT_REFRESH_LIFETIME_SECONDS = int(os.getenv('JWT_REFRESH_LIFETIME_SECONDS','604800'))
JWT_ACCESS_COOKIE = os.getenv('JWT_ACCESS_COOKIE','sakakrib_access')
JWT_REFRESH_COOKIE = os.getenv('JWT_REFRESH_COOKIE','sakakrib_refresh')
JWT_COOKIE_SECURE = os.getenv('JWT_COOKIE_SECURE','false').lower() == 'true'
JWT_COOKIE_SAMESITE = os.getenv('JWT_COOKIE_SAMESITE','Lax')
JWT_COOKIE_DOMAIN = os.getenv('JWT_COOKIE_DOMAIN') or None
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')
REST_FRAMEWORK = {'DEFAULT_AUTHENTICATION_CLASSES':['apps.accounts.authentication.CookieJWTAuthentication'],'DEFAULT_PERMISSION_CLASSES':['rest_framework.permissions.IsAuthenticated'],'DEFAULT_RENDERER_CLASSES':['rest_framework.renderers.JSONRenderer']}
CORS_ALLOWED_ORIGINS = [o.strip() for o in os.getenv('CORS_ALLOWED_ORIGINS','http://localhost:5173,http://127.0.0.1:5173').split(',') if o.strip()]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.getenv('CSRF_TRUSTED_ORIGINS','').split(',') if o.strip()]
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = os.getenv('CSRF_COOKIE_SAMESITE','Lax')
CSRF_COOKIE_SECURE = os.getenv('CSRF_COOKIE_SECURE','false').lower() == 'true'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = os.getenv('SESSION_COOKIE_SAMESITE','Lax')
SESSION_COOKIE_SECURE = os.getenv('SESSION_COOKIE_SECURE','false').lower() == 'true'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO','https')
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
LISTING_FREE_LIMIT = int(os.getenv('LISTING_FREE_LIMIT','3'))
INDIVIDUAL_LISTING_PRICE_KES = int(os.getenv('INDIVIDUAL_LISTING_PRICE_KES','1000'))
MPESA_CONSUMER_KEY = os.getenv('MPESA_CONSUMER_KEY','')
MPESA_CONSUMER_SECRET = os.getenv('MPESA_CONSUMER_SECRET','')
MPESA_SHORTCODE = os.getenv('MPESA_SHORTCODE','')
MPESA_PASSKEY = os.getenv('MPESA_PASSKEY','')
MPESA_CALLBACK_URL = os.getenv('MPESA_CALLBACK_URL','')
MPESA_BASE_URL = os.getenv('MPESA_BASE_URL','https://sandbox.safaricom.co.ke')
MPESA_PAYOUT_CALLBACK_SECRET = os.getenv('MPESA_PAYOUT_CALLBACK_SECRET','')
PAYPAL_CLIENT_ID = os.getenv('PAYPAL_CLIENT_ID','')
PAYPAL_CLIENT_SECRET = os.getenv('PAYPAL_CLIENT_SECRET','')
PAYPAL_BASE_URL = os.getenv('PAYPAL_BASE_URL','https://api-m.sandbox.paypal.com')
PAYPAL_WEBHOOK_ID = os.getenv('PAYPAL_WEBHOOK_ID','')
PAYPAL_LISTING_WEBHOOK_ID = os.getenv('PAYPAL_LISTING_WEBHOOK_ID','')
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
MOVING_PAYPAL_WEBHOOK_ID = os.getenv('MOVING_PAYPAL_WEBHOOK_ID','')
EXCHANGE_RATE_API_KEY = os.getenv('EXCHANGE_RATE_API_KEY', os.getenv('EXCHANGERATE_API_KEY',''))
EXCHANGE_RATE_API_BASE_URL = os.getenv('EXCHANGE_RATE_API_BASE_URL', os.getenv('EXCHANGERATE_API_BASE_URL','https://v6.exchangerate-api.com/v6'))
EXCHANGERATE_API_KEY = EXCHANGE_RATE_API_KEY
EXCHANGERATE_API_BASE_URL = EXCHANGE_RATE_API_BASE_URL
