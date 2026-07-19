# Informe técnico: fallos no implementados

## Alcance y selección

Los cuatro fallos ejecutados en el clúster son caída de Inventario, latencia de Pagos, sobrecarga del Gateway y caída de Notificaciones. Este informe analiza los dos restantes: conectividad intermitente con PostgreSQL y condición de carrera por el último asiento. Ambos comprometen datos y, por ello, requieren más que reiniciar pods.

## 1. Base de Datos Intermitente

### 1.1 Por qué ocurre

El *flapping* puede originarse en pérdida de paquetes, reinicio del endpoint, agotamiento del pool, NAT o failover. Una escritura tiene varias fases: el cliente envía SQL, PostgreSQL ejecuta y confirma, y la respuesta vuelve. Si la conexión se corta después del `COMMIT` pero antes de recibir la confirmación, el cliente observa un resultado desconocido: reintentar ciegamente puede duplicar el cobro o la reserva.

CAP no significa escoger siempre dos letras. Solo durante una partición existe tensión entre consistencia y disponibilidad. Para ventas se prioriza consistencia de inventario y pagos: si no puede confirmarse el líder autoritativo, se devuelve un error reintentable en vez de aceptar una venta potencialmente doble. El sistema puede conservar disponibilidad parcial para lecturas obsoletas o consulta de eventos, pero no para descontar el último asiento.

Los timeouts deben estar ordenados: timeout de conexión < timeout de consulta < presupuesto total HTTP. Un pool ilimitado convierte una partición en agotamiento de memoria y conexiones. El retry solo es seguro para errores transitorios y operaciones idempotentes; los errores de validación o unicidad no se reintentan.

### 1.2 Solución de producción

1. PostgreSQL administrado o StatefulSet con operador, réplica síncrona según RPO/RTO, backups y pruebas de restauración.
2. PgBouncer con límites de pool y espera; readiness del servicio depende de poder adquirir una conexión, mientras liveness solo verifica el proceso.
3. Una clave de idempotencia única por compra. La misma solicitud siempre devuelve el resultado previamente guardado.
4. Transacción corta para reserva y evento Outbox. El email se publica después; no extiende la transacción.
5. Retry con backoff y jitter únicamente si SQLSTATE indica serialización/deadlock o si no se inició la transacción. Ante resultado ambiguo, consultar por idempotency key antes de repetir.
6. Métricas: conexiones usadas/esperando, latencia p95/p99, errores SQLSTATE, abortos, réplica atrasada y tasa de resultados ambiguos.

### 1.3 Pseudocódigo

```text
comprar(cmd, idempotencyKey):
  previo = SELECT respuesta FROM solicitudes WHERE clave = idempotencyKey
  si previo existe: retornar previo
  repetir máximo 3 veces:
    intentar:
      BEGIN ISOLATION LEVEL SERIALIZABLE
      INSERT solicitudes(clave, estado='EN_PROCESO')
      reservar_asiento_atomico(cmd.seatId)
      INSERT reserva(...)
      INSERT outbox(tipo='ReservaCreada', payload=...)
      UPDATE solicitudes SET estado='COMPLETA', respuesta=...
      COMMIT
      retornar respuesta
    capturar serialization_failure/deadlock:
      ROLLBACK; esperar backoff + jitter
    capturar conexión perdida con resultado ambiguo:
      consultar solicitudes por clave en una conexión nueva
      si completa: retornar respuesta; si no: error 503 reintentable
```

### 1.4 Validación

Inyectar pérdida intermitente mediante Toxiproxy o NetworkPolicy temporal. Verificar que no aparezcan dos filas para una misma clave, que los errores sean 503 acotados, que el pool no crezca sin límite y que el sistema se recupere al restablecer la ruta.

## 2. Condición de Carrera: último asiento

### 2.1 Por qué ocurre

Con la secuencia “leer disponibilidad; luego descontar”, dos transacciones pueden leer disponible=true antes de que cualquiera escriba. Ambas confirman y se produce *lost update* o doble venta. No es un problema que puedan resolver réplicas de Kubernetes: más réplicas amplían la ventana de concurrencia. Un mutex dentro de un pod tampoco coordina a los demás pods y se pierde al reiniciar.

En términos de aislamiento, Read Committed evita lecturas sucias, pero no garantiza que la decisión basada en una lectura siga siendo válida al escribir. El invariante de dominio es: para cada evento y asiento existe como máximo una reserva activa. Este invariante debe residir en el sistema autoritativo, no solo en código de aplicación.

### 2.2 Solución de producción

La opción preferida es una operación atómica en PostgreSQL y una restricción única `(event_id, seat_id)` para reservas activas. Puede usarse:

- `UPDATE seats SET status='HELD', hold_id=$1, expires_at=... WHERE event_id=$2 AND seat_id=$3 AND status='AVAILABLE' RETURNING *`; exactamente un comprador obtiene una fila.
- O `SELECT ... FOR UPDATE` dentro de una transacción corta, seguido del cambio.
- Para alta demanda, *holds* con expiración permiten pagar sin bloquear la fila durante una llamada de red. Un proceso recupera holds vencidos de forma idempotente.

La restricción única constituye la última barrera aun si existe un error de aplicación. No se mantiene una transacción abierta mientras se llama a Pagos. El flujo es saga: crear hold, cobrar con idempotencia y confirmar; si falla el pago, liberar o dejar expirar el hold.

### 2.3 Pseudocódigo

```text
crearHold(eventId, seatId, buyerId, key):
  BEGIN
  INSERT INTO holds(id, event_id, seat_id, buyer_id, expires_at, key)
  SELECT ..., now()+interval '5 minutes', key
  FROM seats
  WHERE event_id=? AND seat_id=? AND status='AVAILABLE'
  ON CONFLICT (event_id, seat_id) DO NOTHING
  si filas_insertadas = 0: ROLLBACK; retornar 409
  UPDATE seats SET status='HELD' WHERE event_id=? AND seat_id=?
  COMMIT
  retornar 201 con holdId

confirmarHold(holdId, paymentId):
  BEGIN
  UPDATE holds SET status='CONFIRMED', payment_id=?
    WHERE id=? AND status='ACTIVE' AND expires_at > now()
  si filas_actualizadas = 0: ROLLBACK; retornar 409
  UPDATE seats SET status='SOLD' WHERE hold_id=?
  INSERT outbox(...)
  COMMIT
```

### 2.4 Prueba determinista

Inicializar un único asiento, lanzar al menos 50 clientes sincronizados con barrera y la misma pareja evento/asiento. La aserción final es exactamente un 201, cuarenta y nueve 409, una sola fila confirmada y ningún cobro duplicado. Repetir mientras se reinicia una réplica para demostrar que el invariante está en la base, no en el proceso.

## Conclusiones

Los dos fallos exigen consistencia explícita. Para conectividad intermitente, idempotencia, transacciones, límites y tratamiento del resultado ambiguo evitan que un retry cause daños. Para concurrencia, una operación atómica y una restricción única protegen el invariante bajo cualquier número de réplicas. Kubernetes recupera capacidad de cómputo; PostgreSQL y el diseño transaccional protegen la verdad del negocio.

## Referencias técnicas

- PostgreSQL Global Development Group. *Transaction Isolation* y *Explicit Locking*, documentación oficial de PostgreSQL 16.
- Kleppmann, M. *Designing Data-Intensive Applications*. O'Reilly, 2017.
- Richardson, C. *Microservices Patterns*. Manning, 2018 (Saga y Transactional Outbox).
- Nygard, M. *Release It!*, 2.ª ed. Pragmatic Bookshelf, 2018 (timeouts, circuit breaker y bulkheads).

