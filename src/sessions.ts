import { BookingSession } from './types';

// In-memory session store — keyed by sessionId
const sessions = new Map<string, BookingSession>();

export function storeSession(session: BookingSession): void {
  sessions.set(session.sessionId, session);
}

export function getSession(sessionId: string): BookingSession | undefined {
  return sessions.get(sessionId);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}
