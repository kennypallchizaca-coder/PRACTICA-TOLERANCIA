# Guion de demostración (10-15 minutos)

**Modalidad:** trabajo individual. El estudiante ejecuta los comandos y explica simultáneamente el resultado observado. La consigna original menciona dos integrantes; esta entrega documenta de forma transparente que fue realizada por una sola persona.

## Preparación (2 min)

1. Mostrar `kubectl get nodes` y `kubectl get pods -o wide`: Reservas, Inventario y Gateway deben tener réplicas distribuidas.
2. Abrir dos terminales: `kubectl logs -f deployment/reservas` y `kubectl get pods -w`.
3. Ejecutar una compra base mediante `kubectl port-forward service/api-gateway 3001:3001` y una petición POST.

## Fallo 1: Inventario fantasma (2 min)

- Antes: dos pods Ready y compra 201.
- Acción: `./chaos/01-inventario-fantasma.ps1` y, simultáneamente, una compra.
- Durante: Kubernetes elimina un pod; Service enruta a la réplica sana. Si coincide una conexión, aparece `dependency_retry`.
- Después: Deployment recrea el pod, vuelve a Ready y el sistema sigue aceptando compras.

## Fallo 2: Pasarela lenta (3 min)

- Acción: `./chaos/02-pasarela-lenta.ps1` y efectuar varias compras.
- Esperado: cada llamada vence a 2,5 s; hay tres intentos con backoff. Después de tres operaciones fallidas el circuito queda abierto 15 s y responde 503 rápidamente, sin conexiones colgadas 20 s.
- Evidencia: logs `dependency_retry`, `reservation_failed` y latencia del cliente.

## Fallo 3: Diluvio (3 min)

- Acción: `./chaos/03-diluvio-peticiones.ps1`.
- Esperado: respuestas 201 o rechazos 503 con `Retry-After`, nunca procesos sin respuesta. Observar `kubectl get hpa -w` y logs `bulkhead_rejected`.

## Fallo 4: Correo perdido (2 min)

- Acción: `./chaos/04-correo-perdido.ps1` y comprar un asiento nuevo.
- Esperado: HTTP 201 porque correo no pertenece a la transacción crítica; log `notification_deferred` demuestra el fallback.

## Cierre (1 min)

Ejecutar `./chaos/restaurar.ps1`, comprobar todos los pods Ready y resumir: disponibilidad mediante réplicas, latencia mediante timeout/circuito, sobrecarga mediante bulkhead/HPA y fallo no crítico mediante fallback.
