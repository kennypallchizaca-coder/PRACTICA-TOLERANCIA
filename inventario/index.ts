import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

const PORT = 3003;
let asientosDisponibles = 100; // Estado en memoria simple por ahora

app.post('/descontar', (req: Request, res: Response) => {
    if (asientosDisponibles > 0) {
        asientosDisponibles--;
        console.log(`[INVENTARIO] Asiento reservado. Restantes: ${asientosDisponibles}`);
        res.status(200).json({ exito: true, asientosRestantes: asientosDisponibles });
    } else {
        console.error(`[INVENTARIO ERROR] Intento de compra sin stock`);
        res.status(400).json({ error: "No hay asientos disponibles" });
    }
});

app.listen(PORT, () => console.log(`Servicio de Inventario corriendo en puerto ${PORT}`));