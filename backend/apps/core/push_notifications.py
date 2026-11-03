import json
import logging
import os

from django.conf import settings
from django.db import DatabaseError

from apps.accounts.models import Profile, PushDeviceToken

logger = logging.getLogger(__name__)

APP_NAME = 'sakakrib-fcm'
ALLOWED_APP_VIEWS = {
    'home', 'listings', 'listing-detail', 'listing-manage', 'movers',
    'mover-detail', 'mover-booking-detail', 'chat', 'community',
    'post-listing', 'dashboard', 'my-bookings', 'my-listings',
    'subscription-plans', 'pms-dashboard', 'renter-invoices',
    'renter-payment', 'renter-moving-history', 'mover-tracking',
    'live-mover-map', 'renter-calendar', 'renter-messages',
    'renter-notifications', 'mover-calendar', 'mover-booking-requests',
    'mover-upcoming-jobs', 'mover-customers', 'mover-invoices',
    'mover-earnings', 'mover-notifications', 'mover-messages',
    'moving-financial-records', 'moving-transaction-timeline',
    'profile',
}


def _firebase_app():
    raw_credentials = str(getattr(settings, 'FIREBASE_SERVICE_ACCOUNT_JSON', '') or '').strip()
    credentials_file = str(getattr(settings, 'FIREBASE_SERVICE_ACCOUNT_FILE', '') or '').strip()
    has_adc = bool(os.getenv('GOOGLE_APPLICATION_CREDENTIALS'))

    if not raw_credentials and not credentials_file and not has_adc:
        return None

    try:
        import firebase_admin
        from firebase_admin import credentials

        try:
            return firebase_admin.get_app(APP_NAME)
        except ValueError:
            if raw_credentials:
                service_account = json.loads(raw_credentials)
                credential = credentials.Certificate(service_account)
            elif credentials_file:
                credential = credentials.Certificate(credentials_file)
            else:
                credential = credentials.ApplicationDefault()

            options = {}
            project_id = str(getattr(settings, 'FIREBASE_PROJECT_ID', '') or '').strip()
            if project_id:
                options['projectId'] = project_id
            return firebase_admin.initialize_app(credential, options or None, name=APP_NAME)
    except Exception:
        logger.exception('Firebase Admin initialization failed; push delivery is unavailable.')
        return None


def notification_deep_link(notification_type, data=None, recipient_role=''):
    """Return an internal AppView route, never an external or executable URL."""
    payload = data if isinstance(data, dict) else {}
    explicit = str(payload.get('deep_link') or payload.get('target_route') or '').strip()
    if explicit:
        route = explicit.lstrip('#/').strip()
        view, _, object_id = route.partition('/')
        if view in ALLOWED_APP_VIEWS:
            return f'{view}/{object_id}' if object_id else view

    kind = f"{str(notification_type or '').strip().upper()} {str(payload.get('action_type') or '').strip().upper()}"
    role = str(recipient_role or '').strip().lower()
    booking_id = str(payload.get('booking_id') or '').strip()
    listing_id = str(payload.get('listing_id') or '').strip()
    mover_id = str(payload.get('mover_id') or '').strip()

    if booking_id and any(term in kind for term in ('TRACK', 'MAP', 'LOCATION', 'MOVING_STARTED')):
        return f'live-mover-map/{booking_id}'

    if any(term in kind for term in ('PAYOUT', 'EARNING')):
        return 'mover-earnings' if role == 'mover' else 'notifications'

    if 'SCHEDULE' in kind or 'CALENDAR' in kind:
        return 'mover-calendar' if role == 'mover' else 'renter-calendar'

    if 'DISPUTE' in kind:
        return f'mover-booking-detail/{booking_id}' if booking_id and role == 'mover' else 'my-bookings'

    if 'CHAT' in kind or 'MESSAGE' in kind or payload.get('conversation_id'):
        if role == 'mover':
            other_user_id = str(
                payload.get('renter_user_id')
                or payload.get('renter_id')
                or payload.get('sender_id')
                or payload.get('other_user_id')
                or ''
            ).strip()
        else:
            # The renter chat route expects the Mover profile ID, not its user ID.
            other_user_id = str(
                payload.get('mover_id')
                or payload.get('other_user_id')
                or ''
            ).strip()
        if other_user_id:
            return f'mover-messages/{other_user_id}' if role == 'mover' else f'chat/{other_user_id}'
        if booking_id:
            return f'mover-booking-detail/{booking_id}' if role == 'mover' else f'live-mover-map/{booking_id}'

    if listing_id:
        return f'listing-detail/{listing_id}'

    if booking_id:
        return f'mover-booking-detail/{booking_id}' if role == 'mover' else 'my-bookings'

    if mover_id:
        return f'mover-detail/{mover_id}'

    if any(term in kind for term in ('RENT', 'INVOICE', 'PAYMENT_SUBMISSION')):
        return 'renter-invoices' if role == 'renter' else 'pms-dashboard'
    if 'PAYMENT' in kind:
        return 'renter-payment' if role == 'renter' else 'moving-financial-records'

    if any(term in kind for term in ('SUBSCRIPTION', 'PLAN')):
        return 'subscription-plans'
    if any(term in kind for term in ('APPLICATION', 'KYC', 'VERIFICATION')):
        return 'dashboard'
    if 'MOVER' in kind:
        return 'mover-notifications' if role == 'mover' else 'movers'
    if role == 'renter':
        return 'renter-notifications'
    if role == 'mover':
        return 'mover-notifications'
    if role in {'landlord', 'real_estate'}:
        return 'pms-dashboard'
    return 'dashboard'


def _fcm_data(notification_id, notification_type, data, deep_link):
    """FCM data values must be strings; only send identifiers needed for routing."""
    payload = {
        'notification_id': str(notification_id),
        'notification_type': str(notification_type or ''),
        'deep_link': deep_link,
    }
    source = data if isinstance(data, dict) else {}
    for key in ('booking_id', 'listing_id', 'mover_id', 'mover_user_id', 'renter_user_id', 'renter_id', 'sender_id', 'conversation_id'):
        value = source.get(key)
        if value is not None and str(value).strip():
            payload[key] = str(value)
    return payload


def send_user_notification_push(*, user_id, notification_id, notification_type, title, body, data=None):
    """Send an FCM notification to all active native devices for one user.

    Push delivery is best-effort and never rolls back the database notification.
    """
    app = _firebase_app()
    if app is None:
        return 0

    profile = Profile.objects.filter(pk=user_id).only('role').first()
    if profile is None:
        return 0

    try:
        tokens = list(
            PushDeviceToken.objects.filter(user_id=user_id, is_active=True)
            .values_list('token', flat=True)
        )
    except DatabaseError:
        logger.exception('Unable to retrieve FCM device registrations.')
        return 0

    if not tokens:
        return 0

    try:
        from firebase_admin import messaging
    except ImportError:
        logger.warning('firebase-admin is not installed; push delivery is unavailable.')
        return 0

    deep_link = notification_deep_link(notification_type, data, profile.role)
    message_data = _fcm_data(notification_id, notification_type, data, deep_link)
    sent = 0

    for offset in range(0, len(tokens), 500):
        batch_tokens = tokens[offset:offset + 500]
        message = messaging.MulticastMessage(
            tokens=batch_tokens,
            notification=messaging.Notification(
                title=str(title or 'Saka Krib'),
                body=str(body or ''),
            ),
            data=message_data,
            android=messaging.AndroidConfig(
                priority='high',
                notification=messaging.AndroidNotification(
                    icon='ic_stat_sakakrib',
                    color='#0C3B2E',
                    channel_id='sakakrib_notifications',
                ),
            ),
            apns=messaging.APNSConfig(
                headers={'apns-priority': '10'},
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(sound='default'),
                ),
            ),
        )
        try:
            response = messaging.send_each_for_multicast(message, app=app)
            sent += response.success_count
            invalid_tokens = []
            for token, item in zip(batch_tokens, response.responses):
                if item.success:
                    continue
                error_code = getattr(item.exception, 'code', None)
                if error_code in {
                    'messaging/registration-token-not-registered',
                    'messaging/invalid-registration-token',
                }:
                    invalid_tokens.append(token)
            if invalid_tokens:
                PushDeviceToken.objects.filter(token__in=invalid_tokens).update(is_active=False)
        except Exception:
            logger.exception('FCM multicast delivery failed for user %s.', user_id)

    return sent


def send_renter_notification_push(*, notification):
    data = dict(notification.action_payload or {})
    if notification.action_type:
        data.setdefault('action_type', notification.action_type)
    recipients = {str(notification.renter_user_id)}
    if notification.landlord_id:
        recipients.add(str(notification.landlord_id))

    sent = 0
    for recipient_id in recipients:
        sent += send_user_notification_push(
            user_id=recipient_id,
            notification_id=notification.id,
            notification_type=notification.notification_type,
            title=notification.title,
            body=notification.body,
            data=data,
        )
    return sent
