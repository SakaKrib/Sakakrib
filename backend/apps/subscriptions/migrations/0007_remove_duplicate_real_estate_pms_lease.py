from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('subscriptions', '0006_real_estate_pms_lease'),
    ]

    operations = [
        migrations.DeleteModel(
            name='RealEstatePMSLease',
        ),
    ]
