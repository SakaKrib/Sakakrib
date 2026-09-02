from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from .real_estate_pms_views import RealEstatePMSActionView, RealEstatePMSDashboardView


class RealEstatePMSBoundaryTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    @patch('apps.core.real_estate_pms_views.get_pms_access')
    def test_dashboard_rejects_non_real_estate_pms_access(self, get_access):
        get_access.return_value = {
            'allowed': True,
            'role': 'landlord',
            'read_only': False,
            'reason': 'SUBSCRIPTION_ACTIVE',
        }
        request = self.factory.get('/api/pms/real-estate/dashboard/')
        request.user = Mock(id='user-1', role='landlord')

        response = RealEstatePMSDashboardView.as_view()(request)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['pms_access']['role'], 'landlord')

    @patch('apps.core.real_estate_pms_views.get_pms_access')
    def test_action_rejects_grace_period_mutation(self, get_access):
        get_access.return_value = {
            'allowed': True,
            'role': 'real_estate',
            'read_only': True,
            'reason': 'SUBSCRIPTION_GRACE_PERIOD',
        }
        request = self.factory.post(
            '/api/pms/real-estate/action/',
            {'action': 'add_listing', 'listing_id': '00000000-0000-0000-0000-000000000001'},
            format='json',
        )
        request.user = Mock(id='user-1', role='real_estate')

        response = RealEstatePMSActionView.as_view()(request)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['pms_access']['reason'], 'SUBSCRIPTION_GRACE_PERIOD')
