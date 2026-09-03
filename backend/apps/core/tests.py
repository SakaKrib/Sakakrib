from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from .email_templates import EMAIL_TEMPLATES
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
