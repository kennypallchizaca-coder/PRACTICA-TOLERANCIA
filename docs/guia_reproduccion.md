# Guía de Reproducción

Esta guía está diseñada para cualquier persona que clone el repositorio y desee verificar que la arquitectura y los mecanismos de tolerancia a fallos funcionan correctamente en su máquina local.

## 1. Requisitos Previos
- **Docker Desktop** activo y con al menos 6 GB de RAM asignados.
- **kubectl** instalado.
- **kind** (Kubernetes in Docker) instalado.
- **PowerShell 7** (o terminal compatible).

## 2. Creación de la Infraestructura

Levanta el clúster local de 3 nodos (1 control-plane y 2 workers) y despliega los recursos:

```powershell
# 1. Crear el clúster
kind create cluster --name tolerancia-fallos --config kind-config.yaml

# 2. Construir imágenes locales
docker build -t api-gateway:latest ./api-gateway
docker build -t reservas:latest ./reservas
docker build -t inventario:latest ./inventario
docker build -t pagos:latest ./pagos-stub
docker build -t notificaciones:latest ./notificaciones-stub

# 3. Cargar imágenes a los nodos
"api-gateway:latest", "reservas:latest", "inventario:latest", "pagos:latest", "notificaciones:latest" | ForEach-Object { kind load docker-image $_ --name tolerancia-fallos }

# 4. Desplegar los manifiestos
kubectl apply -f k8s-manifests/
kubectl wait --for=condition=available deployment --all --timeout=240s
```

## 3. Prueba Funcional (Camino Feliz)

Antes de inyectar fallos, verifica que el sistema base funciona:

```powershell
# En una terminal separada, abre el puerto:
kubectl port-forward service/api-gateway 3001:3001

# En otra terminal, simula una compra:
curl.exe -X POST http://localhost:3001/api/comprar `
  -H "Content-Type: application/json" `
  -d '{"seatId":"A-10","amount":25,"email":"test@example.com"}'
```
*Deberías recibir un JSON con `"success": true` y `"message": "Reserva confirmada"`.*

## 4. Inyección de Fallos (Demostración de Resiliencia)

Ejecuta los scripts que se encuentran en la carpeta `chaos/` para probar cómo sobrevive el sistema:

1. **Fallo de Disponibilidad:** `.\chaos\01-inventario-fantasma.ps1`
   - *Qué hace:* Elimina un pod de Inventario.
   - *Por qué sobrevive:* El Deployment, las probes de Kubernetes y el reintento de la aplicación redirigen el tráfico a la réplica sana en el otro nodo.

2. **Latencia Extrema:** `.\chaos\02-pasarela-lenta.ps1`
   - *Qué hace:* Fija 20 segundos de retardo en la pasarela de pagos.
   - *Por qué sobrevive:* Actúan los mecanismos de Timeout, Retry con backoff y Circuit Breaker, liberando la solicitud rápidamente sin colgar el sistema.

3. **Fallo No Crítico:** `.\chaos\04-correo-perdido.ps1`
   - *Qué hace:* Apaga (escala a cero) el servicio de notificaciones.
   - *Por qué sobrevive:* El patrón de Fallback acepta la compra y registra que el correo se enviará asíncronamente más tarde.

4. **Sobrecarga (Opcional):** `.\chaos\03-diluvio-peticiones.ps1`
   - *Qué hace:* Inyecta un pico masivo de carga.
   - *Por qué sobrevive:* El patrón Bulkhead en el Gateway evita que se agoten los recursos, devolviendo respuestas `503 Retry-After` controladas.

## 5. Restauración y Limpieza

Para volver a la normalidad dentro del clúster:
```powershell
.\chaos\restaurar.ps1
```

Y una vez terminadas todas tus pruebas, para no consumir recursos en tu PC, destruye el clúster completamente:
```powershell
kind delete cluster --name tolerancia-fallos
```
