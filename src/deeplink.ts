import { LatLng } from './geocode';

export interface DeepLinkParams {
  pickup: LatLng;
  pickupAddress: string;
  dropoff: LatLng;
  dropoffAddress: string;
}

/**
 * Build an app-specific deep link URI that opens the ride selection screen
 * with pickup and dropoff pre-filled.
 *
 * Returns null for apps with no known deep link support (e.g. CU Night Ride).
 * The caller passes the URI to the sub-agent as {{DEEPLINK_URI}}.
 */
export function buildDeepLinkUri(appId: string, params: DeepLinkParams): string | null {
  const { pickup, pickupAddress, dropoff, dropoffAddress } = params;

  // Uber (com.ubercab) — uber:// custom scheme with lat/lng + formatted_address.
  // More reliable than the https://m.uber.com/ul/ universal link.
  if (appId === 'com.ubercab') {
    const p = [
      `action=setPickup`,
      // `pickup[formatted_address]=${encodeURIComponent(pickupAddress)}`,
      `pickup[latitude]=${pickup.lat}`,
      `pickup[longitude]=${pickup.lng}`,
      // `dropoff[formatted_address]=${encodeURIComponent(dropoffAddress)}`,
      `dropoff[latitude]=${dropoff.lat}`,
      `dropoff[longitude]=${dropoff.lng}`,
    ].join('&');
    return `uber://?${p}`;
  }

  // Lyft (com.lyft.android) — lyft:// custom scheme with lat/lng.
  if (appId === 'com.lyft.android' || appId === 'me.lyft.android') {
    const p = [
      `id=lyft`,
      `pickup[latitude]=${pickup.lat}`,
      `pickup[longitude]=${pickup.lng}`,
      `destination[latitude]=${dropoff.lat}`,
      `destination[longitude]=${dropoff.lng}`,
    ].join('&');
    return `lyft://ridetype?${p}`;
  }

  // CU Night Ride and others — no known deep link
  return null;
}
