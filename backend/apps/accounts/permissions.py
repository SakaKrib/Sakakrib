from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    message = 'Administrator access is required.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_staff or user.is_superuser or getattr(user, 'is_admin', False) or user.role == 'admin')
        )


class HasProfileRole(BasePermission):
    required_role = None
    message = 'Your account role does not permit this action.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser or getattr(user, 'is_admin', False) or user.role == 'admin':
            return True
        return bool(self.required_role and user.role == self.required_role)


class IsRenter(HasProfileRole):
    required_role = 'renter'


class IsLandlord(HasProfileRole):
    required_role = 'landlord'


class IsMover(HasProfileRole):
    required_role = 'mover'


class IsRealEstate(HasProfileRole):
    required_role = 'real_estate'
