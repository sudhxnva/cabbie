import { BookingSession } from './types';
import { Session } from './db';

// Check if we're using MongoDB (production mode)
const USE_MONGODB = process.env.MONGO_URI || process.env.MONGODB_URI;

// In-memory session store fallback — keyed by sessionId
const sessions = new Map<string, BookingSession>();

export async function storeSession(session: BookingSession): Promise<void> {
  if (USE_MONGODB) {
    // Store in MongoDB
    await Session.findOneAndUpdate(
      { sessionId: session.sessionId },
      {
        sessionId: session.sessionId,
        request: session.request,
        apps: session.apps,
        rankedResults: session.rankedResults,
      },
      { upsert: true }
    );
  } else {
    // Fallback to in-memory
    sessions.set(session.sessionId, session);
  }
}

export async function getSession(sessionId: string): Promise<BookingSession | undefined> {
  if (USE_MONGODB) {
    // Get from MongoDB
    const session = await Session.findOne({ sessionId });
    if (!session) return undefined;
    return {
      sessionId: session.sessionId,
      request: session.request,
      apps: session.apps,
      rankedResults: session.rankedResults,
      createdAt: session.createdAt,
    };
  } else {
    // Fallback to in-memory
    return sessions.get(sessionId);
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (USE_MONGODB) {
    // Delete from MongoDB
    await Session.deleteOne({ sessionId });
  } else {
    // Fallback to in-memory
    sessions.delete(sessionId);
  }
}
