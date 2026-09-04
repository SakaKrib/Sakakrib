import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("sakakrib")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
app.conf.imports = (
    "apps.core.email_tasks",
    "apps.core.mover_tasks",
    "apps.core.mover_payout_tasks",
)
