export interface LatLng {
  lat: number;
  lng: number;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  importance: number;
  type: string;
  osm_type: string;
}

/**
 * Geocode a free-form address to lat/lng using OpenStreetMap Nominatim.
 *
 * Disambiguation strategy:
 *   - `countrycodes=us` restricts to US results, eliminating most ambiguity
 *   - `limit=3` fetches top 3 candidates ranked by Nominatim's importance score
 *   - We pick the highest-importance result (index 0 is already best)
 *   - Full addresses with city + state + zip in the query string are specific
 *     enough that the top result is almost always correct
 */
export async function geocodeAddress(address: string): Promise<LatLng> {
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(address)}` +
    `&format=json` +
    `&limit=3` +
    `&countrycodes=us`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Cabbie/1.0 (hackathon price comparison)',
      'Accept-Language': 'en-US,en',
    },
  });

  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status} for address: ${address}`);
  }

  const results: NominatimResult[] = await res.json();

  if (results.length === 0) {
    throw new Error(`No geocoding results for: "${address}"`);
  }

  // Results are already sorted by importance descending — take the best match.
  // Log a warning if the top result looks low-confidence.
  const best = results[0];
  if (best.importance < 0.3) {
    console.warn(
      `  [geocode] Low-confidence result for "${address}" → "${best.display_name}" (importance ${best.importance.toFixed(2)})`
    );
  }

  return {
    lat: parseFloat(best.lat),
    lng: parseFloat(best.lon),
  };
}
