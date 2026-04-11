import 'dotenv/config';

/**
 * API Server for WhatsApp CRM
 * Express server for local development and testing
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import apiRoutes from './api-routes';
import { logInfo, logError } from './logger';

const app = express();
const PORT = process.env.API_PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  logInfo(`[API] ${req.method} ${req.path}`);
  next();
});

// Mount API routes
app.use('/api', apiRoutes);

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logError('API', 'middleware', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

export function startApiServer(): void {
  app.listen(PORT, () => {
    logInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logInfo('          API SERVER STARTED             ');
    logInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logInfo(`Listening on port: ${PORT}`);
    logInfo(`API URL: http://localhost:${PORT}/api`);
    logInfo(`Health check: http://localhost:${PORT}/api/health`);
    logInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log();
    logInfo('Available endpoints:');
    logInfo('  GET  /api/health - Health check');
    logInfo('  GET  /api/readiness - Readiness check');
    logInfo('  GET  /api/contacts - List contacts');
    logInfo('  POST /api/contacts - Create contact');
    logInfo('  POST /api/send-message - Send single message');
    logInfo('  POST /api/send-bulk - Send bulk messages');
    logInfo('  GET  /api/campaigns - List campaigns');
    logInfo('  POST /api/campaigns - Create campaign');
    logInfo('  GET  /api/templates - List templates');
    logInfo('  GET  /api/inbox - Get inbox/conversations');
    logInfo('  GET  /api/stats - Get statistics');
    logInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
}

// If run directly
if (require.main === module) {
  startApiServer();
}

export default app;
