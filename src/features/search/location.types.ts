export interface ResolvedLocation {
  id: string;
  name: string;
  nameUk: string;
  nameEn: string | null;
  nameIt: string | null;
  countryCode: string | null;
  providerLocationId: string | null;
}

export type LocationSearchRow = ResolvedLocation;
