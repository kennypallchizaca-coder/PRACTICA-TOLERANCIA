import express = require('express');
import axios = require('axios');
import type { Request, Response } from 'express';

const app = express();
app.use(express.json());

const PORT = 3001;

app.post('/api/comprar', async (req: Request, res: Response) => {
    console.log("[GATEWAY] Recibiendo petición de compra cliente...");
    try {
        // Redirige la petición al servicio Core
        const response = await axios.post('http://reservas:3002/reservar', req.body);
        res.status(response.status).json(response.data);
    } catch (error: any) {
        const status = error.response ? error.response.status : 500;
        res.status(status).json({ error: "Fallo en el Gateway", detalle: error.message });
    }
});

app.listen(PORT, () => console.log(`API Gateway corriendo en puerto ${PORT}`));