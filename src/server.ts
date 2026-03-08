import express, { Request, Response } from 'express';
import cors from 'cors';
import { orchestrate } from './orchestrator';
import { BookingRequest } from './types';
import { setAlexaReminder } from './alexa_service';

export const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// GET /health — sanity check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// POST /booking/request — accepts BookingRequest, runs orchestration, returns results
app.post('/booking/request', async (req: Request, res: Response) => {
  const request: BookingRequest = req.body;

  if (!request.userId || !request.pickup || !request.dropoff || !request.constraints) {
    return res.status(400).json({ error: 'Invalid BookingRequest' });
  }

  console.log(`[ALEXA/GATEWAY] Received booking request to search: ${request.pickup.address} -> ${request.dropoff.address}`);

  // Return success immediately so the Cloud Lambda doesn't hang (8s timeout)
  res.json({
    status: 'processing',
    message: 'Orchestration started in background',
    estimatedCompletion: '1-2 minutes'
  });

  // prepare an optional notification helper if the caller supplied alexaContext
  let notify: ((msg: string) => Promise<void>) | undefined;
  if (request.alexaContext) {
    notify = async (msg: string) => {
      try {
        await setAlexaReminder(
          {
            accessToken: request.alexaContext!.apiAccessToken,
            apiEndpoint: request.alexaContext!.apiEndpoint,
            refreshToken: request.alexaContext!.refreshToken,
          },
          msg,
        );
      } catch (e) {
        // already logged inside setAlexaReminder; swallow to avoid crashing
      }
    };
  }

  // Run the long-running orchestrator in the background
  try {
    const results = await orchestrate(request, notify);
    console.log(`[ALEXA/GATEWAY] Orchestration complete for ${request.userId}. Found ${results.length} results.`);

    // the orchestrator will have already sent incremental reminders; you can
    // still send a final one here if you want
  } catch (error: any) {
    console.error('[ALEXA/GATEWAY] Background orchestration failed:', error.message);
  }
});

// POST /booking/confirm — triggers booking completion
app.post('/booking/confirm', (req: Request, res: Response) => {
  const { userId, optionId } = req.body;
  console.log(`[ALEXA/GATEWAY] Received confirmation for user ${userId}:`, optionId);

  res.json({
    status: 'confirmed',
    message: 'Booking completion is not yet implemented (Slice 5).',
    details: { userId, optionId }
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Cabbie backend listening at http://localhost:${PORT}`);
  });
}
