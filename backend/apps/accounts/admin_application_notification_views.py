from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin
from apps.core.domain_platform import NotificationEmail
from apps.core.email_services import queue_email


APPLICANT_EMAIL_TYPES = {
    'landlord_application_submitted',
    'mover_application_submitted',
}
ADMIN_EMAIL_TYPES = {
    'landlord_admin_notification',
    'mover_admin_notification',
}
REVIEW_EMAIL_TYPES = {
    'application_approved',
    'application_declined',
    'application_review',
}


class AdminApplicationNotificationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        email_type = str(request.data.get('type') or '').strip()
        if email_type not in APPLICANT_EMAIL_TYPES | ADMIN_EMAIL_TYPES | REVIEW_EMAIL_TYPES:
            return Response({'detail': 'Unsupported application notification type.'}, status=400)

        application = request.data.get('application')
        if not isinstance(application, dict):
            return Response({'detail': 'application payload is required.'}, status=400)

        if email_type in REVIEW_EMAIL_TYPES and not is_admin(request.user):
            return Response({'detail': 'Administrator access is required.'}, status=403)

        payload = dict(application)

        if email_type in APPLICANT_EMAIL_TYPES:
            recipient = str(getattr(request.user, 'email', '') or '').strip().lower()
            if not recipient:
                return Response({'detail': 'Your account does not have an email address.'}, status=400)
            # Never trust a browser-supplied recipient for applicant mail.
            payload['email'] = recipient
            payload['applicant_email'] = recipient
        elif email_type in ADMIN_EMAIL_TYPES:
            recipient = str(getattr(settings, 'ADMIN_EMAIL', '') or '').strip().lower()
            if not recipient:
                return Response({'detail': 'ADMIN_EMAIL is not configured on the server.'}, status=503)
            # The destination is always the server-configured administrator address.
            payload['admin_email'] = recipient
        else:
            recipient = str(
                application.get('email')
                or application.get('applicant_email')
                or ''
            ).strip().lower()
            if not recipient:
                return Response({'detail': 'No recipient email address was provided.'}, status=400)

        # Application submission is now initiated by the Django submission endpoint.
        # Keep this legacy compatibility endpoint safe for existing screens that may
        # still call it: an identical notification queued in the last five minutes
        # is reused instead of sending a duplicate email.
        cutoff = timezone.now() - timedelta(minutes=5)
        existing = NotificationEmail.objects.filter(
            recipient=recipient,
            template_type=email_type,
            created_at__gte=cutoff,
        ).order_by('-created_at').first()
        if existing:
            return Response({
                'success': True,
                'queued': True,
                'sent': existing.status == 'sent',
                'notification_id': str(existing.id),
                'recipient': recipient,
                'type': email_type,
                'subject': existing.subject,
                'deduplicated': True,
            }, status=202)

        try:
            email = queue_email(
                recipient=recipient,
                template_type=email_type,
                payload=payload,
            )
        except Exception as exc:
            return Response({'detail': f'Unable to queue notification email: {exc}'}, status=502)

        return Response({
            'success': True,
            'queued': True,
            'sent': False,
            'notification_id': str(email.id),
            'recipient': recipient,
            'type': email_type,
            'subject': email.subject,
        }, status=202)
