export interface BookingRequest {
  userId: string;
  pickup: { address: string };
  dropoff: { address: string };
  passengers?: number;
  constraints: {
    priority: 'cheapest' | 'fastest' | 'comfortable' | 'luxury' | 'eco' | 'free';
    specificApp?: string;
    maxPrice?: number;
    maxWaitMinutes?: number;
  };
}

export interface ServiceWindow {
  days: number[];       // 0=Sun, 1=Mon, ..., 6=Sat
  startHour: number;    // local time, 0-23
  startMinute: number;
  endHour: number;      // local time — if less than startHour, crosses midnight
  endMinute: number;
  timezone: string;     // IANA tz, e.g. "America/Denver"
}

export interface AppAvailability {
  serviceWindows?: ServiceWindow[];
  // Future: serviceArea for geofencing (pickupBounds, dropoffBounds)
}

export interface AppConfig {
  appName: string;
  appId: string; // android package name e.g. "com.ubercab"
  avdName: string; // AVD name used to launch the emulator e.g. "Pixel_8_2_-_Uber"
  emulatorSerial: string; // e.g. "emulator-5554"
  snapshotName: string; // AVD snapshot to restore before each run
  notes: string;
  memoryFilePath: string; // path to this app's navigation memory file
  availability?: AppAvailability; // if absent, always available
}

export interface RideOption {
  optionId: string; // generated post-agent, not by the agent
  name: string; // "UberX", "Lyft Standard"
  price: string; // keep as string — OCR may return ranges like "$12-14"
  priceMin?: number;
  etaMinutes: number;
  category: 'standard' | 'comfort' | 'xl' | 'luxury' | 'eco' | 'free';
}

export interface PriceResult {
  appName: string;
  success: boolean;
  error?: string;
  options: RideOption[];
}

export interface RankedResult extends RideOption {
  appName: string;
}

export interface BookingSession {
  sessionId: string;
  request: BookingRequest;
  apps: AppConfig[];
  rankedResults: RankedResult[];
  createdAt: Date;
}

export interface BookingConfirmation {
  success: boolean;
  appName: string;
  sessionId: string;
  optionId: string;
  driverName?: string;
  etaMinutes?: number;
  tripId?: string;
  error?: string;
}
