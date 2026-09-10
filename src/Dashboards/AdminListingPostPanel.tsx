import { PlusCircle } from 'lucide-react';
import { useNav } from '@/context/NavContext';

export default function AdminListingPostPanel() {
  const { navigate } = useNav();

  return (
    <section className="card mt-6 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-brand-600" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Create listing</h3>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Create a listing on behalf of an approved landlord or real-estate account using the full administrator listing workflow. The selected owner&apos;s current PMS entitlement determines whether the normal or PMS form is used.
          </p>
        </div>
        <button type="button" onClick={() => navigate('admin-create-listing')} className="btn-primary inline-flex shrink-0 items-center justify-center gap-2">
          <PlusCircle className="h-4 w-4" />
          Create listing
        </button>
      </div>
    </section>
  );
}
