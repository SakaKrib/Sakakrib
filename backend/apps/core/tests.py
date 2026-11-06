from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from .email_templates import EMAIL_SUBJECTS, EMAIL_TEMPLATES
from .booking_email_templates import mover_booking_request
from .subscription_email_templates import SUBSCRIPTION_EMAIL_TEMPLATES
from .push_notifications import notification_deep_link
from .real_estate_pms_views import RealEstatePMSActionView, RealEstatePMSDashboardView


class RealEstatePMSBoundaryTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = type('TestUser', (), {
            'id': 'user-1',
            'role': 'real_estate',
            'is_authenticated': True,
            'is_staff': False,
            'is_superuser': False,
            'is_admin': False,
        })()

    @patch('apps.core.real_estate_pms_views.get_pms_access')
    def test_dashboard_rejects_non_real_estate_pms_access(self, get_access):
        get_access.return_value = {
            'allowed': True,
            'role': 'landlord',
            'read_only': False,
            'reason': 'SUBSCRIPTION_ACTIVE',
        }
        request = self.factory.get('/api/core/pms/real-estate/dashboard/')
        force_authenticate(request, user=self.user)
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
            '/api/core/pms/real-estate/action/',
            {'action': 'add_listing', 'listing_id': '00000000-0000-0000-0000-000000000001'},
            format='json',
        )
        force_authenticate(request, user=self.user)
        response = RealEstatePMSActionView.as_view()(request)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['pms_access']['reason'], 'SUBSCRIPTION_GRACE_PERIOD')


class EmailTemplateStyleParityTests(SimpleTestCase):
    """Keep Django's email presentation aligned with the live Supabase templates."""

    def render(self, template_name, payload=None):
        return EMAIL_TEMPLATES[template_name](payload or {})

    def assert_common_shell(self, html, tagline=None):
        self.assertIn('background:#f6f7f9', html)
        self.assertIn('padding:30px 15px', html)
        self.assertIn('max-width:600px', html)
        self.assertIn('background:#ffffff', html)
        self.assertIn('border-radius:16px', html)
        self.assertIn('font-family:Arial,Helvetica,sans-serif', html)
        self.assertIn('color:#255d3a', html)
        self.assertIn('font-size:30px', html)
        self.assertIn('background:#1e1e1e', html)
        self.assertIn('border-top:1px solid #444444', html)
        self.assertIn('color:#7fcf9a', html)
        self.assertIn('Saka Krib', html)
        if tagline:
            self.assertIn(tagline, html)

    def test_all_django_templates_use_the_common_live_shell(self):
        for name, template in EMAIL_TEMPLATES.items():
            with self.subTest(template=name):
                html = template({})
                self.assert_common_shell(html)
                self.assertTrue(html.startswith('<!DOCTYPE html>'))
                self.assertIn('<meta name="viewport"', html)
                self.assertNotIn('<link ', html)
                self.assertNotIn('<style>', html)

    def test_application_status_panels_match_live_variants(self):
        approved = self.render('application_approved', {'application_type': 'landlord', 'full_name': 'New Applicant'})
        self.assertIn('background:#e8f5e9', approved)
        self.assertIn('border-top:1px solid #c8e6c9', approved)
        self.assertIn('background:#c8e6c9', approved)
        self.assertIn('Application Approved', approved)

        declined = self.render('application_declined', {'application_type': 'landlord', 'full_name': 'New Applicant'})
        self.assertIn('background:#fff3f3', declined)
        self.assertIn('border-top:1px solid #f3d2d2', declined)
        self.assertIn('background:#fde8e8', declined)
        self.assertIn('color:#b42318', declined)

        review = self.render('application_review', {'application_type': 'mover', 'full_name': 'New Applicant'})
        self.assertIn('background:#fff8e6', review)
        self.assertIn('border-top:1px solid #f3e5ab', review)
        self.assertIn('background:#fff0c2', review)
        self.assertIn('Application Under Review', review)

    def test_otp_template_preserves_live_code_block_style(self):
        html = self.render(
            'otp_verification',
            {'full_name': 'New Applicant', 'otp': '123456', 'purpose': 'verify your Saka Krib account'},
        )
        self.assertIn('background:#f1f7f3', html)
        self.assertIn('background:#255d3a', html)
        self.assertIn('font-size:32px', html)
        self.assertIn('letter-spacing:8px', html)
        self.assertIn('background:#f5f7f6', html)
        self.assertIn('border:1px solid #e1e7e3', html)
        self.assertIn('Keep your verification code private.', html)
        self.assertIn('123456', html)

    def test_admin_templates_preserve_live_alert_and_summary_table_style(self):
        landlord = self.render('landlord_admin_notification', {'applicant_name': 'Applicant'})
        mover = self.render('mover_admin_notification', {'applicant_name': 'Applicant'})
        for html in (landlord, mover):
            self.assertIn('background:#fff8e1', html)
            self.assertIn('font-size:38px', html)
            self.assertIn('border:1px solid #e5e7eb', html)
            self.assertIn('border-radius:12px', html)
            self.assertIn('padding:13px', html)
            self.assertIn('Review Application', html)
            self.assertIn('background:#f8faf9', html)
            self.assertIn('border-left:4px solid #255d3a', html)


    def test_renter_unit_request_email_is_styled_and_routes_to_pms_app_link(self):
        html = self.render(
            'renter_unit_request',
            {
                'full_name': 'Property Manager',
                'renter_name': 'Amina Renter',
                'renter_email': 'amina@example.com',
                'renter_phone': '+254700000000',
                'property_title': 'Green View Apartments',
                'property_city': 'Nairobi',
                'unit_number': 'B-12',
                'unit_type': 'Two bedroom',
                'rent_amount': 'KES 25,000.00',
                'request_url': 'https://sakakrib.com/app/pms-dashboard',
            },
        )
        self.assert_common_shell(html, 'Your property, managed with clarity.')
        self.assertIn('New rental request', html)
        self.assertIn('Green View Apartments', html)
        self.assertIn('B-12', html)
        self.assertIn('Amina Renter', html)
        self.assertIn('Review rental request', html)
        self.assertIn('https://sakakrib.com/app/pms-dashboard', html)
        self.assertEqual(
            EMAIL_SUBJECTS['renter_unit_request'],
            'New rental request for your property - Saka Krib',
        )

    def test_renter_unit_request_push_targets_the_owner_pms_dashboard(self):
        self.assertEqual(
            notification_deep_link(
                'RENTER_UNIT_REQUESTED',
                {'listing_id': 'listing-1', 'association_id': 'association-1'},
                'real_estate',
            ),
            'pms-dashboard',
        )

    def test_customer_email_buttons_use_central_app_links(self):
        with patch('apps.core.email_templates.APP_LINK_BASE_URL', 'https://links.example'):
            cases = [
                ('sign_in_notification', {'email': 'person@example.com'}, 'https://links.example/app/account-security'),
                ('sign_up_welcome', {'email': 'person@example.com'}, 'https://links.example/app/dashboard'),
                ('application_approved', {'application_type': 'landlord'}, 'https://links.example/app/dashboard'),
                ('listing_approved', {'listing_id': 'listing-42'}, 'https://links.example/app/listing-detail/listing-42'),
                ('moving_journey_started', {'booking_id': 'booking-42'}, 'https://links.example/app/mover-tracking/booking-42'),
                ('renter_unit_request', {}, 'https://links.example/app/pms-dashboard'),
            ]
            for template_name, payload, expected_url in cases:
                with self.subTest(template=template_name):
                    html = self.render(template_name, payload)
                    self.assertIn(expected_url, html)

            booking_html = mover_booking_request({'booking_id': 'booking-42'})
            self.assertIn('https://links.example/app/mover-booking-detail/booking-42', booking_html)

            for template_name, template in SUBSCRIPTION_EMAIL_TEMPLATES.items():
                with self.subTest(subscription_template=template_name):
                    html = template({})
                    self.assertIn('https://links.example/app/', html)
                    self.assertNotIn('https://sakakrib.com/#', html)

    def test_admin_application_buttons_use_backend_admin_origin(self):
        with patch('apps.core.email_templates.ADMIN_BASE_URL', 'https://api.example'):
            for template_name in ('landlord_admin_notification', 'mover_admin_notification'):
                with self.subTest(template=template_name):
                    html = self.render(template_name, {'applicant_name': 'Applicant'})
                    self.assertIn('https://api.example/admin/', html)

    def test_dynamic_values_are_html_escaped(self):
        html = self.render(
            'sign_up_welcome',
            {
                'full_name': '<script>alert(1)</script>',
                'email': 'x@example.com',
                'dashboard_url': 'https://sakakrib.com/dashboard',
            },
        )
        self.assertNotIn('<script>alert(1)</script>', html)
        self.assertIn('&lt;script&gt;alert(1)&lt;/script&gt;', html)
