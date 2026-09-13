from rest_framework.response import Response
from rest_framework.views import APIView

from .services import (
    add_real_estate_team_member,
    assign_real_estate_listing,
    get_real_estate_listing_assignments,
    get_real_estate_team,
    remove_real_estate_team_member,
    unassign_real_estate_listing,
    update_real_estate_team_member,
)


class RealEstatePMSTeamView(APIView):
    def get(self, request):
        try:
            return Response(get_real_estate_team(request.user))
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=403)

    def post(self, request):
        try:
            result = add_real_estate_team_member(
                request.user,
                user_id=request.data.get('user_id'),
                role=request.data.get('role', 'AGENT'),
                email=request.data.get('email'),
            )
        except ValueError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=400)
        return Response({'success': True, 'member': result})

    def patch(self, request):
        try:
            result = update_real_estate_team_member(
                request.user,
                request.data.get('user_id'),
                request.data.get('role'),
            )
        except ValueError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=400)
        return Response(result)

    def delete(self, request):
        try:
            result = remove_real_estate_team_member(
                request.user,
                request.data.get('user_id') or request.query_params.get('user_id'),
            )
        except ValueError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=400)
        return Response(result)


class RealEstatePMSListingAssignmentsView(APIView):
    def get(self, request):
        try:
            result = get_real_estate_listing_assignments(
                request.user,
                request.query_params.get('listing_id'),
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=403)
        return Response(result)

    def post(self, request):
        try:
            result = assign_real_estate_listing(
                request.user,
                request.data.get('listing_id'),
                request.data.get('agent_id'),
            )
        except ValueError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=400)
        return Response(result)

    def delete(self, request):
        try:
            result = unassign_real_estate_listing(
                request.user,
                request.data.get('listing_id') or request.query_params.get('listing_id'),
                request.data.get('agent_id') or request.query_params.get('agent_id'),
            )
        except ValueError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=400)
        return Response(result)