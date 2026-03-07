import mongoose from 'mongoose';

// load environment variables
import dotenv from 'dotenv';
dotenv.config();

// MongoDB connection string should come from env
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI is not defined in environment');
  process.exit(1);
}

export async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI!);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

// User Schema
export interface IUser {
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  preferences: {
    defaultPriority: 'cheapest' | 'fastest' | 'comfortable' | 'luxury' | 'eco' | 'free';
    maxPrice?: number;
    maxWaitMinutes?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<IUser>({
  userId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: String,
  phone: String,
  preferences: {
    defaultPriority: { type: String, enum: ['cheapest', 'fastest', 'comfortable', 'luxury', 'eco', 'free'], default: 'cheapest' },
    maxPrice: Number,
    maxWaitMinutes: Number,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const User = mongoose.model<IUser>('User', userSchema);

// AppConfig Schema
export interface IAppConfig {
  userId: string;
  appName: string;
  appId: string;
  emulatorSerial: string;
  snapshotName: string;
  notes: string;
  memoryFilePath: string;
  isActive: boolean;
  createdAt: Date;
}

const appConfigSchema = new mongoose.Schema<IAppConfig>({
  userId: { type: String, required: true },
  appName: { type: String, required: true },
  appId: { type: String, required: true },
  emulatorSerial: { type: String, required: true },
  snapshotName: { type: String, required: true },
  notes: { type: String, default: '' },
  memoryFilePath: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export const AppConfig = mongoose.model<IAppConfig>('AppConfig', appConfigSchema);

// BookingRequest Schema
export interface IBookingRequest {
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
  status: 'pending' | 'completed' | 'failed';
  results?: any[]; // Array of RankedResult
  createdAt: Date;
  processedAt?: Date;
}

const bookingRequestSchema = new mongoose.Schema<IBookingRequest>({
  userId: { type: String, required: true },
  pickup: {
    address: { type: String, required: true },
  },
  dropoff: {
    address: { type: String, required: true },
  },
  passengers: { type: Number, default: 1 },
  constraints: {
    priority: { type: String, enum: ['cheapest', 'fastest', 'comfortable', 'luxury', 'eco', 'free'], required: true },
    specificApp: String,
    maxPrice: Number,
    maxWaitMinutes: Number,
  },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  results: [mongoose.Schema.Types.Mixed],
  createdAt: { type: Date, default: Date.now },
  processedAt: Date,
});

export const BookingRequest = mongoose.model<IBookingRequest>('BookingRequest', bookingRequestSchema);