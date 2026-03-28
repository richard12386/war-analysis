export type NotamZone = {
  id: string;
  qCode: string;
  lat: number;
  lng: number;
  radiusM: number;
  lowerFL: number;
  upperFL: number;
  effectiveStart: string;
  effectiveEnd: string;
  location: string;
  rawText: string;
};

export type NotamCache = {
  fetchedAt: string;
  zones: NotamZone[];
};

export function formatNotamExpiry(isoDate: string): string {
  if (!isoDate) return "Permanent";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return (
    d.toLocaleString("cs-CZ", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }) + " UTC"
  );
}
