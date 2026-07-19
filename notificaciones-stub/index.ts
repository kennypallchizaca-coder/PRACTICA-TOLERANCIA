import express = require('express');
import type { Request, Response } from 'express';
const app = express();
app.use(express.json());
const port = Number(process.env.PORT || 3005);
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (_req, res) => res.json({ status: 'ready' }));
app.post('/enviar-correo', async (req: Request, res: Response) => {
  const delay = 50 + Math.floor(Math.random() * 250);
  await new Promise(resolve => setTimeout(resolve, delay));
  if (Math.random() < Number(process.env.FAILURE_RATE || 0.05)) return res.status(503).json({ error: 'Proveedor SMTP temporalmente indisponible' });
  console.log(JSON.stringify({ event: 'email_sent', requestId: req.body.requestId, delay }));
  res.json({ accepted: true });
});
app.listen(port, () => console.log(JSON.stringify({ service: 'notificaciones', port })));
