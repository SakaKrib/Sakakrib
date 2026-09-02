from django.core.mail import send_mail
from django.utils.html import escape
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin


EMAIL_SUBJECTS = {
    'application_approved': 'Your Saka Krib application has been approved',
    'application_declined': 'Update regarding your Saka Krib application',
    'application_review': 'Your Saka Krib application is under review',
}

APPLICATION_NAMES = {
    'landlord': 'landlord',
    'realestate': 'real estate',
    'real_estate': 'real estate',
    'mover': 'mover',
}


def _application_name(application):
    raw = str(
        application.get('application_type')
        or application.get('applicant', {}).get('role')
        or application.get('user', {}).get('role')
        or 'professional'
    ).strip().lower()
    return APPLICATION_NAMES.get(raw, raw or 'professional')


def _applicant_name(application):
    applicant = application.get('applicant') or {}
    user = application.get('user') or {}
    return (
        str(application.get('applicant_name') or '').strip()
        or str(applicant.get('full_name') or '').strip()
        or str(user.get('full_name') or '').strip()
        or str(application.get('full_name') or '').strip()
        or 'there'
    )


def _html(application, email_type):
    name = _applicant_name(application)
    first_name = name.split()[0] if name != 'there' else 'there'
    application_name = _application_name(application)
    note = str(application.get('admin_review_note') or '').strip()
    status = {
        'application_approved': 'Approved',
        'application_declined': 'Declined',
        'application_review': 'Under review',
    }[email_type]
    status_message = {
        'application_approved': f'Your {application_name} application has been approved.',
        'application_declined': f'Your {application_name} application was not approved at this time.',
        'application_review': f'Your {application_name} application is currently under review.',
    }[email_type]
    note_html = f'<p><strong>Administrator note:</strong> {escape(note)}</p>' if note else ''
    return f'''<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.6;background:#f6f7f9;padding:30px"><div style="max-width:600px;margin:auto;background:#fff;padding:30px;border-radius:14px"><h1 style="color:#255d3a">Saka Krib</h1><h2>{escape(status)}</h2><p>Hello {escape(first_name)},</p><p>{escape(status_message)}</p><div style="background:#f5f7f6;padding:18px;border-radius:10px"><strong>Application type:</strong> {escape(application_name)}<br><strong>Status:</strong> {escape(status)}</div>{note_html}<p>You can sign in to your Saka Krib account to continue.</p><p>Thank you for choosing Saka Krib.</p></div></body></html>'''


class AdminApplicationNotificationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_admin(request.user):
            return Response({'detail': 'Administrator access is required.'}, status=403)

        email_type = str(request.data.get('type') or '').strip()
        if email_type not in EMAIL_SUBJECTS:
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

        subject = EMAIL_SUBJECTS[email_type]
        html_message = _html(application, email_type)
        plain_message = f"Saka Krib application update: {_application_name(application)} - {email_type.replace('application_', '').replace('_', ' ').title()}."

        try:
            send_mail(
                subject=subject,
                message=plain_message,
                from_email=None,
                recipient_list=[recipient],
                html_message=html_message,
                fail_silently=False,
            )
        except Exception as exc:
            return Response({'detail': f'Unable to send notification email: {exc}'}, status=502)

        return Response({
            'success': True,
            'sent': True,
            'recipient': recipient,
            'type': email_type,
            'subject': subject,
        }, status=200)
