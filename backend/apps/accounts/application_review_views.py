from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .application_review_services import review_application
from .serializers import ProfileSerializer


class AdminApplicationReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        application_type = str(request.data.get("application_type", "")).strip().lower()
        decision = str(request.data.get("decision", "")).strip().lower()

        try:
            applicant = review_application(
                admin_user=request.user,
                user_id=user_id,
                application_type=application_type,
                decision=decision,
            )
        except PermissionError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except LookupError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "success": True,
                "application_type": application_type,
                "decision": decision,
                "profile": ProfileSerializer(applicant).data,
            },
            status=status.HTTP_200_OK,
        )
