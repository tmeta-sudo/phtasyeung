// Address helpers kept apart from LocationCard, so screens that only need the text (contracts)
// do not pull in the map library.
import { useMemo } from 'react';
import { usePumi, useVillageName } from '../ui.jsx';

/** Khmer address line from pumi ids + house/street. */
export function useAddressText(loc) {
  const pumi = usePumi();
  const village = useVillageName(loc?.villageId);
  return useMemo(() => {
    if (!loc) return '';
    const parts = [loc.houseNo && `ផ្ទះលេខ ${loc.houseNo}`, loc.street && `ផ្លូវ ${loc.street}`, loc.detail, village];
    for (const id of [loc.communeId, loc.districtId, loc.provinceId]) {
      const x = id && pumi?.byId.get(id);
      if (x) parts.push(`${x.unit.km}${x.name.km}`);
    }
    return parts.filter(Boolean).join(', ');
  }, [loc, pumi, village]);
}

export const mapsLink = (loc) => (Number.isFinite(loc?.lat) ? `https://maps.google.com/?q=${loc.lat},${loc.lng}` : '');
