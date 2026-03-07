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

export interface AppConfig {
  appName: string;
  appId: string; // android package name e.g. "com.ubercab"
  emulatorSerial: string; // e.g. "emulator-5554"
  snapshotName: string; // AVD snapshot to restore before each run
  notes: string;
  memoryFilePath: string; // path to this app's navigation memory file
}

export interface RideOption {
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
