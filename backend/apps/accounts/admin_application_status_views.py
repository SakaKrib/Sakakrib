from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .application_status_service import set_application_status
from .serializers import ProfileSerializer


class AdminApplicationStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, user_id):
        application_type = request.data.get('application_type')
        status_value = request.data.get('status')
        note = request.data.get('admin_review_note', '')

        try:
            profile = set_application_status(
                admin_user=request.user,
                user_id=user_id,
                application_type=application_type,
                status_value=status_value,
                note=note,
            )
        except PermissionError as exc:
            return Response({'detail': str(exc)}, status=403)
        except LookupError as exc:
            return Response({'detail': str(exc)}, status=404)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)

        return Response(ProfileSerializer(profile).data)
