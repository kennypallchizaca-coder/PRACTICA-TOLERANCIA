import express = require('express');
import axios = require('axios');
import type { Request, Response } from 'express';

const app = express();
app.use(express.json());

const PORT = 3002;

app.post('/reservar', async (req: Request, res: Response) => {
    try {
        console.log("Iniciando proceso de reserva...");

        // 1. Descontar Inventario
        await axios.post('http://inventario:3003/descontar');

        // 2. Procesar Pago
        await axios.post('http://pagos:3004/procesar-pago');

        // 3. Enviar Notificación (no esperamos a que termine, lo enviamos en segundo plano)
        axios.post('http://notificaciones:3005/enviar-correo').catch(e => console.error("Error al notificar"));

        res.status(200).json({ exito: true, mensaje: "Reserva completada con éxito" });
    } catch (error: any) {
        console.error("[RESERVAS ERROR] Fallo en la transacción", error.message);
        res.status(500).json({ error: "Fallo en el proceso de reserva", detalle: error.message });
    }
});

app.listen(PORT, () => console.log(`Servicio de Reservas corriendo en puerto ${PORT}`));