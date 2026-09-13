from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin
from apps.subscriptions.models import RealEstatePMSListingAssignment, RealEstatePMSMember, RealEstateSubscription, SubscriptionListing

from .models import Listing
from .serializers import ListingSerializer, ListingUpdateSerializer


class RealEstatePMSListingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_listing(self, request, listing_id):
        if not getattr(request.user, 'email_verified', False):
            return None, Response({'error': 'Email verification is required.'}, status=status.HTTP_403_FORBIDDEN)
        listing = Listing.objects.filter(pk=listing_id).first()
        if not listing:
            return None, Response({'error': 'Listing not found.'}, status=status.HTTP_404_NOT_FOUND)
        if is_admin(request.user) or str(listing.user_id) == str(request.user.pk) or (listing.approval_status == 'approved' and listing.is_published):
            return listing, None

        membership = RealEstatePMSMember.objects.filter(
            user_id=request.user.pk,
            real_estate_id=listing.user_id,
            status=RealEstatePMSMember.STATUS_ACTIVE,
        ).first()
        if not membership:
            return None, Response({'error': 'You are not authorized to view this listing.'}, status=status.HTTP_404_NOT_FOUND)
        if not RealEstateSubscription.objects.filter(
            real_estate_id=listing.user_id,
            status__in=['ACTIVE', 'GRACE_PERIOD'],
        ).filter(current_period_end__gt=timezone.now()).exists():
            return None, Response({'error': 'The Real Estate PMS subscription is not active.'}, status=status.HTTP_403_FORBIDDEN)
        if membership.role == RealEstatePMSMember.ROLE_TEAM_MANAGER:
            return listing, None
        if RealEstatePMSListingAssignment.objects.filter(
            real_estate_id=listing.user_id,
            listing_id=listing.id,
            agent_id=request.user.pk,
            is_active=True,
        ).exists():
            return listing, None
        return None, Response({'error': 'This listing is not assigned to you.'}, status=status.HTTP_403_FORBIDDEN)

    def get(self, request, listing_id):
        listing, error = self._get_listing(request, listing_id)
        if error:
            return error
        return Response(ListingSerializer(listing, context={'request': request}).data)

    def patch(self, request, listing_id):
        listing, error = self._get_listing(request, listing_id)
        if error:
            return error

        if is_admin(request.user):
            allowed = True
        elif str(getattr(request.user, 'role', '') or '').lower() == 'real_estate' and str(listing.user_id) == str(request.user.pk):
            allowed = True
        else:
            membership = RealEstatePMSMember.objects.filter(
                user_id=request.user.pk,
                real_estate_id=listing.user_id,
                status=RealEstatePMSMember.STATUS_ACTIVE,
            ).first()
            subscription = RealEstateSubscription.objects.filter(
                real_estate_id=listing.user_id,
                status='ACTIVE',
                current_period_end__gt=timezone.now(),
            ).order_by('-created_at').first()
            allowed = bool(membership and subscription and (
                membership.role == RealEstatePMSMember.ROLE_TEAM_MANAGER or
                RealEstatePMSListingAssignment.objects.filter(
                    real_estate_id=listing.user_id,
                    listing_id=listing.id,
                    agent_id=request.user.pk,
                    is_active=True,
                ).exists()
            ))

        if not allowed:
            return Response({'error': 'You are not authorized to update this listing.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = ListingUpdateSerializer(listing, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_at=timezone.now())
        return Response(ListingSerializer(listing, context={'request': request}).data)

    def put(self, request, listing_id):
        return self.patch(request, listing_id)

    @transaction.atomic
    def delete(self, request, listing_id):
        listing, error = self._get_listing(request, listing_id)
        if error:
            return error
        if not is_admin(request.user) and not (
            str(getattr(request.user, 'role', '') or '').lower() == 'real_estate'
            and str(listing.user_id) == str(request.user.pk)
        ):
            return Response({'error': 'Only the Real Estate PMS administrator can delete this listing.'}, status=status.HTTP_403_FORBIDDEN)
        SubscriptionListing.objects.filter(listing_id=listing.id, status='ACTIVE').update(status='INACTIVE', deactivated_at=timezone.now())
        listing.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)