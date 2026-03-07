import request from 'supertest';
import { app } from './server';
import * as orchestrator from './orchestrator';

// Mock the orchestrator to avoid running actual ADB/Claude commands during tests
jest.mock('./orchestrator');

describe('Cabbie Backend API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 and status ok', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('POST /booking/request', () => {
    const validRequest = {
      userId: 'test-user',
      pickup: { address: 'Pickup Location' },
      dropoff: { address: 'Dropoff Location' },
      constraints: { priority: 'cheapest' }
    };

    it('should return 200 and ranked results on success', async () => {
      const mockResults = [
        { appName: 'Uber', name: 'UberX', price: '$15', etaMinutes: 5, category: 'standard' }
      ];
      (orchestrator.orchestrate as jest.Mock).mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/booking/request')
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResults);
      expect(orchestrator.orchestrate).toHaveBeenCalledWith(validRequest);
    });

    it('should return 400 if request body is invalid', async () => {
      const response = await request(app)
        .post('/booking/request')
        .send({ userId: 'test-user' }); // Missing other required fields

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid BookingRequest' });
    });

    it('should return 500 if orchestration fails', async () => {
      (orchestrator.orchestrate as jest.Mock).mockRejectedValue(new Error('Claude failed'));

      const response = await request(app)
        .post('/booking/request')
        .send(validRequest);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Orchestration failed');
    });
  });

  describe('POST /booking/confirm', () => {
    it('should return 200 and confirmation message', async () => {
      const confirmData = {
        sessionId: 'session-123',
        option: { appName: 'Uber', name: 'UberX' }
      };

      const response = await request(app)
        .post('/booking/confirm')
        .send(confirmData);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('confirmed');
      expect(response.body.details).toEqual(confirmData);
    });
  });
});
