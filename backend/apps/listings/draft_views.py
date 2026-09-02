from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Profile
from .draft_services import delete_listing_draft, get_listing_draft, list_listing_drafts, save_listing_draft


class ListingDraftListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = Profile.objects.get(pk=request.user.id)
        drafts = list_listing_drafts(profile)
        return Response({
            'drafts': [
                {'id': str(d.id), 'role': d.role, 'data': d.data, 'created_at': d.created_at, 'updated_at': d.updated_at}
                for d in drafts
            ]
        })

    def post(self, request):
        profile = Profile.objects.get(pk=request.user.id)
        draft = save_listing_draft(profile, request.data.get('data', request.data), request.data.get('draft_id'))
        return Response({'success': True, 'draft_id': str(draft.id), 'status': draft.status, 'data': draft.data}, status=status.HTTP_200_OK)


class ListingDraftDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, draft_id):
        profile = Profile.objects.get(pk=request.user.id)
        draft = get_listing_draft(profile, draft_id)
        if not draft:
            return Response({'detail': 'Draft not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'id': str(draft.id), 'role': draft.role, 'data': draft.data, 'created_at': draft.created_at, 'updated_at': draft.updated_at})

    def delete(self, request, draft_id):
        profile = Profile.objects.get(pk=request.user.id)
        delete_listing_draft(profile, draft_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
