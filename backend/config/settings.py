import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'unsafe-dev-key-change-me')
DEBUG = os.getenv('DJANGO_DEBUG', 'true').lower() == 'true'
ALLOWED_HOSTS = [host.strip() for host in os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if host.strip()]

INSTALLED_APPS = ['django.contrib.admin','django.contrib.contenttypes','django.contrib.auth','django.contrib.sessions','django.contrib.messages','django.contrib.staticfiles','corsheaders','rest_framework','channels','apps.core','apps.accounts','apps.listings','apps.subscriptions','apps.payments']
MIDDLEWARE = ['corsheaders.middleware.CorsMiddleware','django.middleware.security.SecurityMiddleware','django.contrib.sessions.middleware.SessionMiddleware','django.middleware.common.CommonMiddleware','django.middleware.csrf.CsrfViewMiddleware','django.contrib.auth.middleware.AuthenticationMiddleware','django.contrib.messages.middleware.MessageMiddleware']
ROOT_URLCONF = 'config.urls'
TEMPLATES = [{'BACKEND':'django.template.backends.django.DjangoTemplates','DIRS':[],'APP_DIRS':True,'OPTIONS':{'context_processors':['django.template.context_processors.request','django.contrib.auth.context_processors.auth','django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

REDIS_URL = os.getenv('REDIS_URL', '')
if REDIS_URL:
    CHANNEL_LAYERS = {'default': {'BACKEND': 'channels_redis.core.RedisChannelLayer', 'CONFIG': {'hosts': [REDIS_URL]}}}
else:
    CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}

# Shared Celery infrastructure. The same Redis deployment used by Channels can
# also act as the Celery broker/result backend; dedicated URLs remain supported.
CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', REDIS_URL)
CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', REDIS_URL)
CELERY_TIMEZONE = TIME_ZONE = os.getenv('CELERY_TIMEZONE', 'Africa/Nairobi')
CELERY_ENABLE_UTC = True
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_BEAT_SCHEDULE = {}

AUTH_USER_MODEL = 'accounts.Profile'
AUTHENTICATION_BACKENDS = ['apps.accounts.authentication.CookieJWTAuthenticationBackend']
AUTH_PASSWORD_VALIDATORS = [
 {'NAME':'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
 {'NAME':'django.contrib.auth.password_validation.MinimumLengthValidator','OPTIONS':{'min_length':8}},
 {'NAME':'django.contrib.auth.password_validation.CommonPasswordValidator'},
 {'NAME':'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

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
JWT_ACCESS_LIFETIME_SECONDS = int(os.getenv('JWT_ACCESS_LIFETIME_SECONDS','900'))
JWT_REFRESH_LIFETIME_SECONDS = int(os.getenv('JWT_REFRESH_LIFETIME_SECONDS','604800'))
JWT_ACCESS_COOKIE = os.getenv('JWT_ACCESS_COOKIE','sakakrib_access')
JWT_REFRESH_COOKIE = os.getenv('JWT_REFRESH_COOKIE','sakakrib_refresh')
JWT_COOKIE_SECURE = os.getenv('JWT_COOKIE_SECURE','false').lower() == 'true'
JWT_COOKIE_SAMESITE = os.getenv('JWT_COOKIE_SAMESITE','Lax')
JWT_COOKIE_DOMAIN = os.getenv('JWT_COOKIE_DOMAIN') or None

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

EMAIL_BACKEND = os.getenv('EMAIL_BACKEND','django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = os.getenv('EMAIL_HOST','')
EMAIL_PORT = int(os.getenv('EMAIL_PORT','587'))
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER','')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD','')
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS','true').lower() == 'true'
EMAIL_USE_SSL = os.getenv('EMAIL_USE_SSL','false').lower() == 'true'
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL','no-reply@sakakrib.com')
LISTING_FREE_LIMIT = int(os.getenv('LISTING_FREE_LIMIT','3'))
INDIVIDUAL_LISTING_PRICE_KES = int(os.getenv('INDIVIDUAL_LISTING_PRICE_KES','1000'))
MPESA_CONSUMER_KEY = os.getenv('MPESA_CONSUMER_KEY','')
MPESA_CONSUMER_SECRET = os.getenv('MPESA_CONSUMER_SECRET','')
MPESA_SHORTCODE = os.getenv('MPESA_SHORTCODE','')
MPESA_PASSKEY = os.getenv('MPESA_PASSKEY','')
MPESA_CALLBACK_URL = os.getenv('MPESA_CALLBACK_URL','')
MPESA_BASE_URL = os.getenv('MPESA_BASE_URL','https://sandbox.safaricom.co.ke')
PAYPAL_CLIENT_ID = os.getenv('PAYPAL_CLIENT_ID','')
PAYPAL_CLIENT_SECRET = os.getenv('PAYPAL_CLIENT_SECRET','')
PAYPAL_BASE_URL = os.getenv('PAYPAL_BASE_URL','https://api-m.sandbox.paypal.com')
PAYPAL_WEBHOOK_ID = os.getenv('PAYPAL_WEBHOOK_ID','')
MOVING_PAYPAL_WEBHOOK_ID = os.getenv('MOVING_PAYPAL_WEBHOOK_ID','')
EXCHANGE_RATE_API_KEY = os.getenv('EXCHANGE_RATE_API_KEY', os.getenv('EXCHANGERATE_API_KEY',''))
EXCHANGE_RATE_API_BASE_URL = os.getenv('EXCHANGE_RATE_API_BASE_URL', os.getenv('EXCHANGERATE_API_BASE_URL','https://v6.exchangerate-api.com/v6'))
EXCHANGERATE_API_KEY = EXCHANGE_RATE_API_KEY
EXCHANGERATE_API_BASE_URL = EXCHANGE_RATE_API_BASE_URL
