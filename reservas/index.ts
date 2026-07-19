import express = require('express');
import axios from 'axios';
import type { Request, Response } from 'express';
const { Pool } = require('pg');

const app = express();
app.use(express.json());
const port = Number(process.env.PORT || 3002);
const inventoryUrl = process.env.INVENTARIO_URL || 'http://inventario:3003';
const paymentUrl = process.env.PAGOS_URL || 'http://pagos:3004';
const notificationUrl = process.env.NOTIFICACIONES_URL || 'http://notificaciones:3005';
const db = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || 'practica_tolerancia',
  user: process.env.POSTGRES_USER || 'appuser',
  password: process.env.POSTGRES_PASSWORD || 'apppassword',
  max: 8,
  connectionTimeoutMillis: 800,
  idleTimeoutMillis: 10000
});
let databaseReady = false;

type Circuit = { failures: number; openUntil: number };
const circuits: Record<string, Circuit> = { inventory: { failures: 0, openUntil: 0 }, payment: { failures: 0, openUntil: 0 } };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function resilientPost(name: 'inventory' | 'payment', url: string, data: unknown, requestId: string) {
  const circuit = circuits[name];
  if (Date.now() < circuit.openUntil) throw Object.assign(new Error(`circuit_open:${name}`), { status: 503 });
  let last: any;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await axios.post(url, data, { timeout: name === 'payment' ? 2500 : 1200, headers: { 'x-request-id': requestId } });
      circuit.failures = 0;
      return result.data;
    } catch (error: any) {
      last = error;
      console.warn(JSON.stringify({ event: 'dependency_retry', dependency: name, attempt, requestId, detail: error.message }));
      if (error.response?.status && error.response.status < 500) throw error;
      if (attempt < 3) await sleep(100 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 80));
    }
  }
  circuit.failures++;
  if (circuit.failures >= 3) { circuit.openUntil = Date.now() + 15000; circuit.failures = 0; }
  throw last;
}

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (_req, res) => {
  res.status(databaseReady ? 200 : 503).json({ status: databaseReady ? 'ready' : 'initializing', circuits });
});

app.post('/reservar', async (req: Request, res: Response) => {
  const requestId = String(req.header('x-request-id') || `${Date.now()}-${Math.random()}`);
  const seatId = String(req.body.seatId || 'A-1');
  try {
    await resilientPost('inventory', `${inventoryUrl}/descontar`, { seatId, requestId }, requestId);
    await resilientPost('payment', `${paymentUrl}/procesar-pago`, { amount: req.body.amount || 25, requestId }, requestId);

    await db.query('INSERT INTO reservas(request_id, seat_id) VALUES ($1, $2) ON CONFLICT (request_id) DO NOTHING', [requestId, seatId]);

    axios.post(`${notificationUrl}/enviar-correo`, { requestId, email: req.body.email }, { timeout: 800 })
      .catch((error: Error) => console.warn(JSON.stringify({ event: 'notification_deferred', requestId, detail: error.message })));

    console.log(JSON.stringify({ event: 'reservation_completed', requestId, seatId }));
    res.status(201).json({ success: true, requestId, seatId, message: 'Reserva confirmada' });
  } catch (error: any) {
    const unavailable = error.message?.includes('circuit_open') || !error.response || error.response.status >= 500;
    console.error(JSON.stringify({ event: 'reservation_failed', requestId, detail: error.message }));
    res.status(unavailable ? 503 : error.response.status).json({ error: unavailable ? 'Dependencia temporalmente no disponible' : error.response.data, requestId, retryable: unavailable });
  }
});

async function start() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await db.query('CREATE TABLE IF NOT EXISTS reservas (request_id text PRIMARY KEY, seat_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())');
      databaseReady = true;
      app.listen(port, () => console.log(JSON.stringify({ service: 'reservas', port })));
      return;
    } catch (error: any) {
      console.warn(JSON.stringify({ event: 'db_init_retry', attempt, detail: error.message }));
      await sleep(Math.min(500 * attempt, 3000));
    }
  }
  console.error(JSON.stringify({ event: 'db_init_failed' }));
  process.exit(1);
}

void start();
