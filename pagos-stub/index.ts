import express = require('express');
import type { Request, Response } from 'express';
const app = express();
app.use(express.json());
const port = Number(process.env.PORT || 3004);
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (_req, res) => res.json({ status: 'ready' }));
app.post('/procesar-pago', async (req: Request, res: Response) => {
  const fixed = Number(process.env.FIXED_DELAY_MS || 0);
  const delay = fixed || (100 + Math.floor(Math.random() * 500));
  await new Promise(resolve => setTimeout(resolve, delay));
  if (Math.random() < Number(process.env.FAILURE_RATE || 0.08)) return res.status(503).json({ error: 'Pasarela temporalmente indisponible' });
  console.log(JSON.stringify({ event: 'payment_approved', requestId: req.body.requestId, delay }));
  res.json({ approved: true, transactionId: `tx-${req.body.requestId}` });
});
app.listen(port, () => console.log(JSON.stringify({ service: 'pagos', port })));
