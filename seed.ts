import { connectDB, User, AppConfig } from './src/db';

async function seed() {
  await connectDB();

  // Seed demo user (requires MONGO_URI in .env)
  const demoUser = {
    userId: 'demo-user',
    name: 'Demo User',
    email: 'demo@example.com',
    preferences: {
      defaultPriority: 'cheapest' as const,
    },
  };

  await User.findOneAndUpdate({ userId: demoUser.userId }, demoUser, { upsert: true });
  console.log('Seeded demo user');

  // Seed app configs
  const appConfigs = [
    {
      userId: 'demo-user',
      appName: 'Uber',
      appId: 'com.ubercab',
      avdName: 'Pixel_8_2_-_Uber',
      emulatorSerial: 'emulator-5554',
      snapshotName: 'uber-logged-in',
      notes: '',
      memoryFilePath: 'memory/uber.md',
      isActive: true,
    },
    {
      userId: 'demo-user',
      appName: 'CU Night Ride',
      appId: 'com.sparelabs.platform.rider.cunightride',
      avdName: 'Pixel_8_2_-_CU_NightRide',
      emulatorSerial: 'emulator-5556',
      snapshotName: 'cunightride-logged-in',
      notes: '',
      memoryFilePath: 'memory/cunightride.md',
      isActive: true,
      availability: {
        serviceWindows: [
          // Weekdays Mon–Fri: 7 PM – midnight
          { days: [1, 2, 3, 4, 5], startHour: 19, startMinute: 0, endHour: 0, endMinute: 0, timezone: 'America/Denver' },
          // Weekends Sat–Sun: 7 PM – 1 AM
          { days: [6, 0], startHour: 19, startMinute: 0, endHour: 1, endMinute: 0, timezone: 'America/Denver' },
        ],
      },
    },
    {
      userId: 'demo-user',
      appName: 'Lyft',
      appId: 'com.lyft.android',
      avdName: 'Pixel_8',
      emulatorSerial: 'emulator-5558',
      snapshotName: 'lyft-logged-in',
      notes: '',
      memoryFilePath: 'memory/lyft.md',
      isActive: true,
    },
  ];

  for (const config of appConfigs) {
    await AppConfig.findOneAndUpdate(
      { userId: config.userId, appName: config.appName },
      config,
      { upsert: true }
    );
  }
  console.log('Seeded app configurations');

  console.log('Seeding complete');
  process.exit(0);
}

seed().catch(console.error);