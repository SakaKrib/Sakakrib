from .moving_action_views import MoverBookingRequestView
from .moving_listing import resolve_moving_destination


class ListingAwareMoverBookingRequestView(MoverBookingRequestView):
    """Keep the existing booking lifecycle while making listing destination server-authoritative."""

    def post(self, request):
        listing_id = request.data.get("listing_id")
        if listing_id:
            destination = resolve_moving_destination(
                listing_id=listing_id,
                dropoff_address=request.data.get("dropoff_address"),
                dropoff_latitude=request.data.get("dropoff_latitude"),
                dropoff_longitude=request.data.get("dropoff_longitude"),
            )
            data = request.data.copy()
            data["dropoff_address"] = destination["dropoff_address"]
            data["dropoff_latitude"] = destination["dropoff_latitude"]
            data["dropoff_longitude"] = destination["dropoff_longitude"]
            request._full_data = data
        return super().post(request)
