import express = require('express');
import type { Request, Response } from 'express';

const app = express();
app.use(express.json());
const port = Number(process.env.PORT || 3003);
const seats = new Map<string, string>();

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (_req, res) => res.json({ status: 'ready' }));
app.post('/descontar', (req: Request, res: Response) => {
  const seatId = String(req.body.seatId || 'A-1');
  const requestId = String(req.body.requestId || req.header('x-request-id') || 'unknown');
  if (seats.get(seatId) === requestId) return res.json({ success: true, seatId, idempotent: true });
  if (seats.has(seatId)) return res.status(409).json({ error: 'Asiento no disponible', seatId });
  seats.set(seatId, requestId);
  console.log(JSON.stringify({ event: 'seat_reserved', seatId, requestId }));
  res.json({ success: true, seatId });
});

app.listen(port, () => console.log(JSON.stringify({ service: 'inventario', port })));
