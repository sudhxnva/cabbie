import express, { Request, Response } from 'express';
import cors from 'cors';
import { orchestrate } from './orchestrator';
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
    const results = await Promise.race([
      orchestrate(request),
      timeoutPromise
    ]);

    res.json(results);
  } catch (error: any) {
    console.error('Error during booking request:', error.message);
    const status = error.message.includes('timed out') ? 504 : 500;
    res.status(status).json({ 
      error: 'Orchestration failed', 
      message: error.message 
    });
  }
});

// POST /booking/confirm — stubbed for now
app.post('/booking/confirm', (req: Request, res: Response) => {
  const { sessionId, option } = req.body;
  console.log(`Received confirmation for session ${sessionId}:`, option);
  
  // Slice 5 will implement the actual booking completion
  res.json({ 
    status: 'confirmed', 
    message: 'Booking completion is not yet implemented (Slice 5).',
    details: { sessionId, option }
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Cabbie backend listening at http://localhost:${PORT}`);
  });
}
