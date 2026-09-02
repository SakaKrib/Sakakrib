from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin
from apps.core.email_services import queue_email


EMAIL_TYPES = {
    'application_approved',
    'application_declined',
    'application_review',
}


class AdminApplicationNotificationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_admin(request.user):
            return Response({'detail': 'Administrator access is required.'}, status=403)

        email_type = str(request.data.get('type') or '').strip()
        if email_type not in EMAIL_TYPES:
            return Response({'detail': 'Unsupported application notification type.'}, status=400)

        application = request.data.get('application')
        if not isinstance(application, dict):
            return Response({'detail': 'application payload is required.'}, status=400)

        recipient = str(
            application.get('email')
            or application.get('applicant_email')
            or ''
        ).strip().lower()
        if not recipient:
            return Response({'detail': 'No recipient email address was provided.'}, status=400)

        payload = dict(application)
        payload['email'] = recipient
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
