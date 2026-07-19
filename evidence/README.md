# Resumen de evidencia real

Ejecución realizada el 12 de julio de 2026 en un clúster kind con un nodo de control y dos workers.

| Escenario | Resultado comprobado | Evidencia |
|---|---|---|
| Estado inicial | Tres nodos `Ready`; Gateway, Reservas e Inventario distribuidos entre ambos workers | `00-nodos.txt`, `00-pods-iniciales.txt` |
| Compra base | HTTP 201 antes de inyectar fallos | `00-compra-base.txt` |
| Inventario fantasma | Se eliminó un pod durante la compra; el cliente recibió HTTP 201 y Kubernetes creó un reemplazo `Ready` | `01-inventario-fantasma.txt` |
| Pasarela lenta | Pagos se configuró con 20 s de retardo; el cliente recibió HTTP 504 en 6535 ms y Reservas registró tres retries de 2500 ms | `02-pasarela-lenta.txt` |
| Diluvio de peticiones | k6 ejecutó 29 952 solicitudes con 80 VU; 100% de los checks recibió 201, 503 o 504; el Gateway registró `bulkhead_rejected` | `03-diluvio-peticiones.txt` |
| Correo perdido | Notificaciones se escaló a cero; la compra terminó con HTTP 201 y Reservas registró `notification_deferred` | `04-correo-perdido.txt` |
| Estado final | Servicios restaurados y pods principales `Ready` | `05-estado-final.txt` |
| Métricas | Metrics Server activo; métricas de los tres nodos y HPA con objetivo CPU disponible | `06-metricas-nodos.txt`, `06-metricas-pods.txt`, `06-hpa-final.txt` |
| Verificación final | Imágenes optimizadas desplegadas, pods `Ready`, compra HTTP 201 y HPA con CPU disponible | `07-verificacion-final.txt` |

Después de la prueba de carga se instaló Metrics Server v0.8.1 y se verificó que el HPA reportara `cpu: 1%/60%`. Durante la carga, la defensa observable principal fue el bulkhead, que mantuvo respuestas controladas bajo saturación.
