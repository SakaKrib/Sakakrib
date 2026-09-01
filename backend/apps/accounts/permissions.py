from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    message = 'Admin authorization required.'

    def has_permission(self, request, view):
        return bool(getattr(request.user, 'role', '') == 'admin')


class IsLandlord(BasePermission):
    message = 'Landlord authorization required.'

    def has_permission(self, request, view):
        return bool(getattr(request.user, 'role', '') == 'landlord')


class IsRealEstate(BasePermission):
    message = 'Real estate authorization required.'

    def has_permission(self, request, view):
        return bool(getattr(request.user, 'role', '') == 'real_estate')
