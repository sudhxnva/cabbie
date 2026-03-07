import { AppConfig, BookingRequest } from '../src/types';
import { User, AppConfig as AppConfigModel, connectDB } from '../src/db';

// Initialize DB connection
connectDB();

// Fetch user from DB
export async function getUser(userId: string) {
  const user = await User.findOne({ userId });
  if (!user) throw new Error(`User ${userId} not found`);
  return user;
}

// Fetch app configs for user from DB
export async function getAppConfigs(userId: string): Promise<AppConfig[]> {
  const configs = await AppConfigModel.find({ userId, isActive: true });
  return configs.map(c => ({
    appName: c.appName,
    appId: c.appId,
    emulatorSerial: c.emulatorSerial,
    snapshotName: c.snapshotName,
    notes: c.notes,
    memoryFilePath: c.memoryFilePath,
  }));
}

// Hardcoded BookingRequest — simulates what frontend/API would send
// In production, this would come from API request body
export const HARDCODED_BOOKING_REQUEST: BookingRequest = {
  userId: 'demo-user',
  pickup: { address: '1800 Williams St, Denver, CO' },
  dropoff: { address: 'Denver International Airport, Denver, CO' },
  passengers: 1,
  constraints: {
    priority: 'cheapest',
  },
};
