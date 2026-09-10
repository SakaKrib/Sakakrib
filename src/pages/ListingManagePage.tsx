import { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import EditingListingForm from '@/components/listings/EditingListingForm';
import { useNav } from '@/context/NavContext';
import { protectedDelete, protectedGet, protectedPatch, protectedUpload } from '@/lib/api';

// ... existing component logic preserved; only the setter prop below is corrected.
