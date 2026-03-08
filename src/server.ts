import express, { Request, Response } from 'express';
import cors from 'cors';
import { orchestrate } from './orchestrator';
import { invokeBookingAgent } from './claude';
import { getSession, deleteSession } from './sessions';
import { BookingRequest } from './types';

export const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// GET /health — sanity check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// POST /booking/request — accepts BookingRequest, runs orchestration, returns ranked results
app.post('/booking/request', async (req: Request, res: Response) => {
  const request: BookingRequest = req.body;

  if (!request.userId || !request.pickup || !request.dropoff || !request.constraints) {
    return res.status(400).json({ error: 'Invalid BookingRequest' });
  }

  console.log(`Received booking request for user: ${request.userId}`);

  // Create a timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Orchestration timed out after 180 seconds'));
    }, 180_000);
  });

  try {
    // Race between orchestration and timeout
    const { sessionId, results } = await Promise.race([
      orchestrate(request),
      timeoutPromise
    ]) as Awaited<ReturnType<typeof orchestrate>>;

    res.json({ sessionId, results });
  } catch (error: any) {
    console.error('Error during booking request:', error.message);
    const status = error.message.includes('timed out') ? 504 : 500;
    res.status(status).json({ 
      error: 'Orchestration failed', 
      message: error.message 
    });
  }
});

// POST /booking/confirm — invokes booking agent for the selected option
app.post('/booking/confirm', async (req: Request, res: Response) => {
  const { sessionId, optionId } = req.body;

  if (!sessionId || !optionId) {
    return res.status(400).json({ error: 'sessionId and optionId are required' });
  }

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  const option = session.rankedResults.find(r => r.optionId === optionId);
  if (!option) {
    return res.status(404).json({ error: `Option ${optionId} not found in session` });
  }

  const app = session.apps.find(a => a.appName === option.appName);
  if (!app) {
    return res.status(404).json({ error: `App config for ${option.appName} not found` });
  }

  console.log(`Confirming booking: session=${sessionId}, option=${option.name} on ${option.appName}`);

  try {
    const confirmation = await invokeBookingAgent(app, option, session.request);
    const result = { ...confirmation, sessionId, optionId };

    // Clean up session after successful booking
    if (confirmation.success) {
      deleteSession(sessionId);
    }

    res.json(result);
  } catch (error: any) {
    console.error('Error during booking confirmation:', error.message);
    res.status(500).json({ error: 'Booking failed', message: error.message });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Cabbie backend listening at http://localhost:${PORT}`);
  });
}
