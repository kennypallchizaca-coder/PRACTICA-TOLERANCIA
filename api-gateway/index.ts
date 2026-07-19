import express = require('express');
import axios from 'axios';
import type { Request, Response, NextFunction } from 'express';

const app = express();
app.use(express.json());
const port = Number(process.env.PORT || 3001);
const reservasUrl = process.env.RESERVAS_URL || 'http://reservas:3002';
const maxConcurrent = Number(process.env.MAX_CONCURRENT || 40);
let active = 0;

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (_req, res) => res.json({ status: 'ready' }));

function bulkhead(req: Request, res: Response, next: NextFunction) {
  if (active >= maxConcurrent) {
    console.warn(JSON.stringify({ event: 'bulkhead_rejected', active, maxConcurrent }));
    return res.status(503).set('Retry-After', '1').json({ error: 'Sistema ocupado', retryable: true });
  }
  active++;
  let released = false;
  const release = () => { if (!released) { released = true; active--; } };
  res.on('finish', release);
  res.on('close', release);
  next();
}

app.post('/api/comprar', bulkhead, async (req: Request, res: Response) => {
  const requestId = String(req.header('x-request-id') || `${Date.now()}-${Math.random()}`);
  try {
    const response = await axios.post(`${reservasUrl}/reservar`, req.body, {
      timeout: 6500,
      headers: { 'x-request-id': requestId }
    });
    res.status(response.status).json(response.data);
  } catch (error: any) {
    const timeout = error.code === 'ECONNABORTED';
    const status = timeout ? 504 : (error.response?.status || 503);
    console.error(JSON.stringify({ event: 'gateway_error', requestId, status, detail: error.message }));
    res.status(status).json({ error: timeout ? 'Tiempo de espera agotado' : 'Servicio no disponible', requestId, retryable: status >= 500 });
  }
});

app.listen(port, () => console.log(JSON.stringify({ service: 'api-gateway', port, maxConcurrent })));
