import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import translateRouter from './routes/translate';

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.LLM_MODEL || "qwen-plus";
const BASE_URL = process.env.LLM_BASE_URL || "not set";

// ─── Middleware ───────────────────────────────────────────────────────────────
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
  console.error("[Server Error]", err.message);
  res.status(500).json({ status: "error", message: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[WPS Translate Server] Running on http://localhost:${PORT}`);
  console.log(`[WPS Translate Server] Model: ${MODEL}`);
  console.log(`[WPS Translate Server] LLM Base URL: ${BASE_URL}`);
});

export default app;
