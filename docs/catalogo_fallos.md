# Catálogo de los seis puntos de fallo

| Escenario | Mecanismo controlado | Defensa o decisión |
|---|---|---|
| Inventario fantasma | `kubectl delete pod` de una réplica mientras existe tráfico | réplicas en nodos distintos, readiness, retry con backoff y circuit breaker |
| Pasarela lenta | variable `FIXED_DELAY_MS=20000` en el Deployment de Pagos | timeout de 2,5 s, retries acotados y circuit breaker; error 503 controlado |
| Diluvio de peticiones | Job k6 con 80 VU durante 30 s | bulkhead de 40 solicitudes por pod, límites de recursos y HPA |
| Base de datos intermitente | Toxiproxy/NetworkPolicy alternante entre servicios y PostgreSQL | pool acotado, retry solo para errores transitorios, transacciones e idempotencia |
| Correo perdido | escalar Notificaciones a cero réplicas | fallback asíncrono: confirmar compra y registrar `notification_deferred` para una cola/outbox |
| Condición de carrera | dos clientes simultáneos para el mismo `seatId` | restricción única y actualización/bloqueo atómico en PostgreSQL |

Los cuatro primeros experimentos implementados en el repositorio son Inventario, Pagos lento, Sobrecarga y Notificaciones. Los dos restantes se desarrollan teóricamente en el informe.
