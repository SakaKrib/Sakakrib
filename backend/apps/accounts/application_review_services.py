from .application_status_service import set_application_status


APPLICATION_TYPES = {'landlord', 'real_estate', 'mover'}


def review_application(*, admin_user, user_id, application_type: str, decision: str):
    """Backward-compatible adapter for the older POST review endpoint."""
    application_type = str(application_type or '').strip().lower()
    decision = str(decision or '').strip().lower()

    if application_type not in APPLICATION_TYPES:
        raise ValueError('Unsupported application type')
    if decision not in {'approved', 'rejected'}:
        raise ValueError('Decision must be approved or rejected')

    return set_application_status(
        admin_user=admin_user,
        user_id=user_id,
        application_type=application_type,
        status_value=decision,
        note='',
    )
