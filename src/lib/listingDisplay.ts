export type PropertyUnitPreview = { id: string; status?: string | null };

export function getPropertyUnitSummary(listing: {
  is_property_management?: boolean;
  units?: PropertyUnitPreview[] | null;
}): { total: number; available: number } | null {
  if (!listing.is_property_management || !Array.isArray(listing.units) || listing.units.length === 0) {
    return null;
  }

  return {
    total: listing.units.length,
    available: listing.units.filter((unit) => String(unit.status || '').toLowerCase() !== 'occupied').length,
  };
}
