from django.db import transaction
from django.utils import timezone

from .models import Profile


APPLICATION_FIELDS = {
    "landlord": ("landlord_application_status", "landlord"),
    "real_estate": ("real_estate_application_status", "real_estate"),
}


@transaction.atomic
def review_application(*, admin_user: Profile, user_id, application_type: str, decision: str) -> Profile:
    if not (admin_user.is_admin or admin_user.is_staff or admin_user.is_superuser):
        raise PermissionError("Administrator access is required")
    if application_type not in APPLICATION_FIELDS:
        raise ValueError("Unsupported application type")
    if decision not in {"approved", "rejected"}:
        raise ValueError("Decision must be approved or rejected")

    status_field, approved_role = APPLICATION_FIELDS[application_type]
    applicant = Profile.objects.select_for_update().filter(id=user_id).first()
    if not applicant:
        raise LookupError("Applicant not found")

    # An application review is a transition out of the renter application queue.
    # Once a user has already become a landlord/real-estate account, this endpoint
    # must not be used to silently rewrite their application state or role.
    if applicant.role != "renter":
        raise ValueError("Only renter accounts can be reviewed for this application")
    if getattr(applicant, status_field) != "pending":
        raise ValueError(f"Application is not pending (current status: {getattr(applicant, status_field)})")

    setattr(applicant, status_field, decision)
    if decision == "approved":
        applicant.role = approved_role

    applicant.admin_review_note = ""
    applicant.updated_at = timezone.now()
    applicant.save(update_fields=[status_field, "role", "admin_review_note", "updated_at"])
    return applicant
