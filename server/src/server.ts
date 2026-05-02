import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import pinoHttp from 'pino-http';
import { logger, asyncLocalStorage } from './lib/logger';
import translateRouter from './routes/translate';

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.LLM_MODEL || "qwen-plus";
const BASE_URL = process.env.LLM_BASE_URL || "not set";

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const reqId = (req.headers['x-request-id'] as string) || randomUUID();
  asyncLocalStorage.run(reqId, () => {
    next();
  });
});

app.use(pinoHttp({
  logger,
  genReqId: () => asyncLocalStorage.getStore() || randomUUID(),
  autoLogging: {
    ignore: (req) => req.url === '/api/health'
  }
}));

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ─── Routes ───────────────────────────────────────────────────────────────────

/** Health check — responds within 50ms */
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    model: MODEL,
    timestamp: new Date().toISOString(),
  });
});

/** Translation routes */
app.use("/api/v1/translate", translateRouter);

// ─── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err }, '[Server Error] ' + err.message);
  res.status(500).json({ status: "error", message: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`[WPS Translate Server] Running on http://localhost:${PORT}`);
  logger.info(`[WPS Translate Server] Model: ${MODEL}`);
  logger.info(`[WPS Translate Server] LLM Base URL: ${BASE_URL}`);
});

export default app;
