import { useEffect, useState } from 'react';

import AdminCreateListingFlow, {
  type AdminCreateListingInput,
  type AdminEligibleUser,
} from '@/components/admin/AdminCreateListingFlow';
import { protectedGet, protectedPost, protectedUpload } from '@/lib/djangoApi';
import { formatKES } from '@/lib/utils';

const HOUSE_SIZES = ['Under 500 sq ft', '500–750 sq ft', '750–1,000 sq ft', '1,000–1,500 sq ft', '1,500–2,000 sq ft', '2,000+ sq ft', 'Custom Size'];
const SOCIAL_PLATFORMS = ['WhatsApp', 'Facebook', 'Instagram', 'X', 'Website', 'Other'];

interface OwnerResponse extends AdminEligibleUser {
  subscription?: { status: string | null } | null;
}
interface CreatedUnit { id: string; }
interface CreateResponse { listing_id: string; listing?: { units?: CreatedUnit[] }; }

export default function AdminCreateListingPage() {
  const [users, setUsers] = useState<OwnerResponse[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingUsers(true);
      setError(null);
      try {
        const response = await protectedGet<OwnerResponse[]>('/api/listings/admin/post-on-behalf/');
        if (!cancelled) setUsers(Array.isArray(response) ? response : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load listing owners.');
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const handleCreateListing = async (input: AdminCreateListingInput) => {
    setCreating(true);
    setError(null);
    setSuccess(false);
    try {
      if (input.photos.length < 3) throw new Error('Please add at least 3 property photos.');
      if (input.category === 'pms' && input.units.length < 1) throw new Error('Please add at least one property unit.');
      if (input.category === 'pms' && input.units.some((unit) => unit.photos.length < 3)) throw new Error('Each PMS unit must have at least 3 photos.');

      const f = input.fields;
      const payload = {
        owner_id: input.userId,
        title: f.title || '', description: f.description || '', city: f.city || '', county: f.county || '',
        location_search: f.locationSearch || null, latitude: f.latitude ?? null, longitude: f.longitude ?? null,
        property_name: f.propertyName || null, property_type: f.propertyType || null,
        price_kes: f.price || null, listing_type: f.listingType || 'rent',
        deposit_required: Boolean(f.depositRequired), deposit_structure: f.depositStructure || 'fixed', deposit_amount: f.depositAmount || 0,
        size: f.size || null, beds: Number(f.beds || 0), baths: Number(f.baths || 0),
        contact_phone: f.phone || null, contact_email: f.email || null,
        social_links: Array.isArray(f.socialLinks) ? f.socialLinks : [],
        booking_enabled: input.category === 'pms' ? Boolean(f.bookingEnabled) : false,
        payment_enabled: input.category === 'pms' ? Boolean(f.paymentEnabled) : false,
        is_property_management: input.category === 'pms',
        units: input.category === 'pms' ? input.units.map((unit) => ({
          unit_number: unit.unitNumber, unit_type: unit.unitType, rent: unit.rent || 0, deposit_amount: unit.depositAmount || 0,
          size: unit.size || null, beds: Number(unit.beds || 0), baths: Number(unit.baths || 1), availability: unit.availability, description: unit.description || '',
        })) : [],
      };

      const created = await protectedPost<CreateResponse>('/api/listings/admin/post-on-behalf/', payload);
      const listingId = created?.listing_id;
      if (!listingId) throw new Error('Django created the listing but did not return its ID.');

      const upload = async (file: File, mediaType: 'photo' | 'video', label: string, position: number, unitId?: string) => {
        const form = new FormData();
        form.append('listing_id', listingId); form.append('owner_id', input.userId); form.append('file', file);
        form.append('media_type', mediaType); form.append('label', label); form.append('position', String(position));
        if (unitId) form.append('unit_id', unitId);
        await protectedUpload('/api/listings/admin/media/', form);
      };

      for (let index = 0; index < input.photos.length; index += 1) {
        const photo = input.photos[index];
        if (photo.file) await upload(photo.file, 'photo', photo.label, index);
      }
      if (input.video?.file) await upload(input.video.file, 'video', input.video.label || 'Walkthrough Video', 0);

      if (input.category === 'pms') {
        const createdUnits = created.listing?.units || [];
        for (let index = 0; index < input.units.length; index += 1) {
          const unitId = createdUnits[index]?.id;
          if (!unitId) continue;
          for (let photoIndex = 0; photoIndex < input.units[index].photos.length; photoIndex += 1) {
            const photo = input.units[index].photos[photoIndex];
            if (photo.file) await upload(photo.file, 'photo', photo.label, photoIndex, unitId);
          }
        }
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create the listing.');
    } finally { setCreating(false); }
  };

  if (loadingUsers) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500">Loading approved landlord and real-estate accounts…</div>;

  return <AdminCreateListingFlow users={users} formatKES={formatKES} HOUSE_SIZES={HOUSE_SIZES} SOCIAL_PLATFORMS={SOCIAL_PLATFORMS} onCreateListing={handleCreateListing} creating={creating} error={error} success={success} onCancel={() => window.history.back()} />;
}
