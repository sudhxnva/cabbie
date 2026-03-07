import { AppConfig, BookingRequest } from '../src/types';

// Simulated MongoDB user document
export const HARDCODED_USER = {
  userId: 'demo-user',
  name: 'Demo User',
};

// Simulated AppConfig[] — what the user has set up in their profile
// Update emulatorSerial and snapshotName to match your AVDs
export const HARDCODED_APP_CONFIGS: AppConfig[] = [
  {
    appName: 'Uber',
    appId: 'com.ubercab',
    emulatorSerial: 'emulator-5554',
    snapshotName: 'uber-logged-in',
    notes: '',
    memoryFilePath: 'memory/uber.md',
  },
  {
    appName: 'Lyft',
    appId: 'com.lyft.android',
    emulatorSerial: 'emulator-5556',
    snapshotName: 'lyft-logged-in',
    notes: '',
    memoryFilePath: 'memory/lyft.md',
  },
];

// Hardcoded BookingRequest — simulates what voice/frontend would send
export const HARDCODED_BOOKING_REQUEST: BookingRequest = {
  userId: 'demo-user',
  pickup: { address: '1800 Williams St, Denver, CO' },
  dropoff: { address: 'Denver International Airport, Denver, CO' },
  passengers: 1,
  constraints: {
    priority: 'cheapest',
  },
};
