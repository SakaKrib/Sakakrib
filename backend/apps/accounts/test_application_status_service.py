from datetime import date

from django.test import TestCase

from apps.core.domain_platform import Mover, MoverApplication

from .application_status_service import set_application_status
from .models import Profile


class ApplicationStatusServiceTests(TestCase):
    def setUp(self):
        self.admin = Profile.objects.create_user(
            email='admin-status-tests@example.com',
            password='A-strong-password-123',
            email_verified=True,
            role='admin',
        )

    def _profile(self, application_type, status_value=None):
        suffix = status_value or 'fixture'
        return Profile.objects.create_user(
            email=f'{application_type}-{suffix}-status-tests@example.com',
            password='A-strong-password-123',
            email_verified=True,
            role=application_type,
            kyc_completed=True,
            kyc_status='pending',
            verification_status='pending_verification',
        )

    def _mover_application(self, profile, suffix='01'):
        return MoverApplication.objects.create(
            applicant_id=profile.id,
            applicant_email=profile.email,
            applicant_name=profile.full_name or 'Mover Applicant',
            driver_full_name=profile.full_name or 'Mover Applicant',
            national_id=f'123456{suffix}',
            dl_number=f'DL{suffix}456',
            vehicle_type='pickup',
            number_plate=f'KDA{suffix}AB',
            capacity_details='1.5 ton pickup',
            operating_city='Nairobi',
            operating_county='Nairobi',
            phone='0712345678',
            base_rate_kes=1500,
            rate_per_km_kes=80,
            payment_channel='mpesa_send_money',
            payment_account='0712345678',
            insurance_policy_details='Valid insurance',
            vehicle_inspection_expiry=date(2099, 12, 31),
            liability_accepted=True,
            terms_accepted=True,
            status='pending',
        )

    def test_nine_application_status_combinations_keep_profile_state_canonical(self):
        expected = {
            'pending': {
                'role': 'renter',
                'kyc_status': 'pending',
                'kyc_completed': False,
                'verification_status': 'pending_verification',
            },
            'approved': {
                'kyc_status': 'approved',
                'kyc_completed': True,
                'verification_status': 'verified',
            },
            'rejected': {
                'role': 'renter',
                'kyc_status': 'rejected',
                'kyc_completed': False,
                'verification_status': 'rejected',
            },
        }

        for application_type in ('landlord', 'real_estate', 'mover'):
            for status_value in ('pending', 'approved', 'rejected'):
                with self.subTest(application_type=application_type, status=status_value):
                    profile = self._profile(application_type, status_value)
                    field = f'{application_type}_application_status'

                    if application_type == 'mover':
                        status_code = {'pending': '01', 'approved': '02', 'rejected': '03'}[status_value]
                        self._mover_application(profile, status_code)
                        Mover.objects.create(
                            user_id=profile.id,
                            driver_full_name=profile.full_name or 'Mover Applicant',
                            national_id=f'123456{status_code}',
                            dl_number=f'DL{status_code}456',
                            vehicle_type='pickup',
                            number_plate=f'KDA{status_code}AB',
                            operating_city='Nairobi',
                            operating_county='Nairobi',
                            phone='0712345678',
                            payment_channel='mpesa_send_money',
                            payment_account='0712345678',
                            approval_status='pending_review',
                            is_available=False,
                        )

                    set_application_status(
                        admin_user=self.admin,
                        user_id=profile.id,
                        application_type=application_type,
                        status_value=status_value,
                    )

                    profile.refresh_from_db()
                    self.assertEqual(getattr(profile, field), status_value)
                    for key, value in expected[status_value].items():
                        if key == 'role' and status_value == 'approved':
                            value = application_type
                        self.assertEqual(getattr(profile, key), value)

                    if application_type == 'mover':
                        mover = Mover.objects.get(user_id=profile.id)
                        mover_application = MoverApplication.objects.get(applicant_id=profile.id)
                        expected_mover_status = 'pending_review' if status_value == 'pending' else status_value
                        self.assertEqual(mover.approval_status, expected_mover_status)
                        self.assertEqual(mover.is_available, status_value == 'approved')
                        self.assertEqual(mover_application.status, status_value)
                        self.assertEqual(mover_application.reviewed_by, self.admin.id)

    def test_approved_mover_application_materializes_missing_mover(self):
        profile = self._profile('mover', 'missing-record')
        application = self._mover_application(profile, '99')

        self.assertFalse(Mover.objects.filter(user_id=profile.id).exists())

        set_application_status(
            admin_user=self.admin,
            user_id=profile.id,
            application_type='mover',
            status_value='approved',
            note='Approved after KYC review',
        )

        mover = Mover.objects.get(user_id=profile.id)
        self.assertEqual(mover.approval_status, 'approved')
        self.assertTrue(mover.is_available)
        self.assertEqual(mover.driver_full_name, application.driver_full_name)
        self.assertEqual(mover.national_id, application.national_id)
        self.assertEqual(mover.dl_number, application.dl_number)
        self.assertEqual(mover.vehicle_type, application.vehicle_type)
        self.assertEqual(mover.number_plate, application.number_plate)
        self.assertEqual(mover.operating_city, application.operating_city)
        self.assertEqual(mover.operating_county, application.operating_county)
        self.assertEqual(mover.phone, application.phone)
        self.assertEqual(mover.base_rate_kes, application.base_rate_kes)
        self.assertEqual(mover.rate_per_km_kes, application.rate_per_km_kes)
        self.assertEqual(mover_application_status := MoverApplication.objects.get(pk=application.pk).status, 'approved')
        self.assertEqual(mover_application_status, 'approved')

    def test_rejected_new_mover_application_does_not_materialize_mover(self):
        profile = self._profile('mover', 'rejected-missing-record')
        self._mover_application(profile, '88')

        set_application_status(
            admin_user=self.admin,
            user_id=profile.id,
            application_type='mover',
            status_value='rejected',
        )

        self.assertFalse(Mover.objects.filter(user_id=profile.id).exists())
        self.assertEqual(MoverApplication.objects.get(applicant_id=profile.id).status, 'rejected')

    def test_reapproved_existing_mover_is_synchronized_from_latest_application(self):
        profile = self._profile('mover', 'reapproved')
        mover = Mover.objects.create(
            user_id=profile.id,
            driver_full_name='Old Name',
            national_id='1111111',
            dl_number='OLD123',
            vehicle_type='pickup',
            number_plate='OLD123AB',
            operating_city='Mombasa',
            operating_county='Mombasa',
            phone='0700000000',
            payment_channel='mpesa_send_money',
            payment_account='0700000000',
            approval_status='rejected',
            is_available=False,
        )
        application = self._mover_application(profile, '77')

        set_application_status(
            admin_user=self.admin,
            user_id=profile.id,
            application_type='mover',
            status_value='approved',
        )

        mover.refresh_from_db()
        self.assertEqual(mover.approval_status, 'approved')
        self.assertTrue(mover.is_available)
        self.assertEqual(mover.driver_full_name, application.driver_full_name)
        self.assertEqual(mover.number_plate, application.number_plate)
        self.assertEqual(mover.operating_city, application.operating_city)

    def test_non_admin_cannot_change_application_status(self):
        user = self._profile('landlord')

        with self.assertRaises(PermissionError):
            set_application_status(
                admin_user=user,
                user_id=user.id,
                application_type='landlord',
                status_value='approved',
            )

    def test_invalid_application_status_is_rejected_before_mutation(self):
        user = self._profile('landlord')

        with self.assertRaises(ValueError):
            set_application_status(
                admin_user=self.admin,
                user_id=user.id,
                application_type='landlord',
                status_value='verified',
            )

        user.refresh_from_db()
        self.assertEqual(user.landlord_application_status, 'not_requested')
        self.assertEqual(user.kyc_status, 'pending')
        self.assertEqual(user.kyc_completed, True)
        self.assertEqual(user.verification_status, 'pending_verification')
