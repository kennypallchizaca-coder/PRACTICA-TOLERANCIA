# Preguntas y Respuestas para Defensa de la Práctica (Basado en Rúbrica)

**Proyecto:** Sistema de Reservas Tolerante a Fallos (`PRACTICA-TOLERANCIA`)  
**Asignatura:** Tolerancia a Fallos  
**Autor:** Alex Guaman  

Este documento contiene un banco de preguntas y respuestas estructurado específicamente para defender los requisitos exigidos en el documento de la práctica (`PRACTICA.pdf`), abarcando desde la arquitectura hasta el análisis teórico.

---

## 1. Sobre la Arquitectura y Kubernetes (Parte I)

**P1: ¿Por qué se exigió desplegar en un clúster Kubernetes de al menos dos nodos y cómo se garantizó la distribución?**
**R:** Se exigió porque la tolerancia a fallos real debe probarse contra la caída de hardware/infraestructura subyacente, no solo de procesos lógicos. Para garantizarlo, usamos reglas de **`podAntiAffinity` (requiredDuringSchedulingIgnoredDuringExecution)** en los manifiestos de Kubernetes. Esto obliga al *scheduler* a colocar las réplicas de servicios críticos (Reservas, Inventario) en nodos (workers) distintos. Si un nodo físico cae, la réplica en el otro nodo sigue operando.

**P2: ¿Por qué utilizamos "Stubs" para los servicios de Pagos y Notificaciones en lugar de lógica de negocio real?**
**R:** Porque el foco de la práctica no es construir lógica de negocio, sino probar la resiliencia de nuestro Core (Reservas) frente al comportamiento impredecible de terceros. Los stubs nos permiten simular de forma determinista y realista latencias altas, timeouts y caídas abruptas (fallos transitorios) que ocurrirían en pasarelas externas reales.

---

## 2. Sobre los Mecanismos de Resiliencia (Parte II y III)

**P3: En el fallo "Inventario Fantasma" (eliminación de pod), ¿cuál es el mecanismo técnico exacto que salva al sistema?**
**R:** Es una combinación de las capacidades de Kubernetes y nuestro código. Primero, las **sondas Liveness/Readiness** sacan al pod muerto del balanceador de carga (`Service`) instantáneamente. Segundo, como tenemos al menos 2 **réplicas distribuidas**, el otro pod absorbe el tráfico. Tercero, si una petición estaba en pleno vuelo durante el corte, el patrón **Retry con Idempotencia** en el servicio de Reservas vuelve a lanzar la petición al pod sano de forma transparente.

**P4: En el escenario "La Pasarela Lenta" (Pagos tarda 20s), ¿por qué no basta con un Timeout y usamos un Circuit Breaker?**
**R:** El Timeout es la primera defensa para liberar el hilo bloqueado a los 2.5s. Sin embargo, si seguimos recibiendo cientos de compras, todas van a reintentar y esperar 2.5s, saturando la red y encolando procesos. El **Circuit Breaker** detecta que el servicio de Pagos está degradado, se "abre", y automáticamente rechaza todas las nuevas llamadas (devolviendo `503`) sin siquiera intentar conectarse. Esto evita un fallo en cascada y le da "respiro" al servicio lento para recuperarse.

**P5: En el fallo "Diluvio de Peticiones", ¿cómo protege el patrón Bulkhead al API Gateway?**
**R:** El patrón Bulkhead ("Mamparo") aísla los recursos. En el API Gateway limitamos el nivel máximo de peticiones concurrentes (ej. 40 conexiones simultáneas por pod). Cuando entra el pico repentino simulado con `k6`, en lugar de que el pod consuma toda su memoria intentando procesar miles de hilos y se cuelgue (tumbando el contenedor), el Bulkhead rechaza el exceso inmediatamente con un error controlado `503 Retry-After`. Esto salva al servidor y garantiza que las peticiones que sí entraron se procesen con éxito.

**P6: ¿Por qué es seguro usar el patrón "Fallback" cuando ocurre "El Correo Perdido" (Notificaciones inactivo)?**
**R:** Porque clasificamos el envío de correos como una **dependencia no crítica**. En la lógica de negocio, lo crítico es asegurar el cobro y reservar el asiento. Si Notificaciones falla, el *Fallback* captura el error, confirma la venta al usuario (`HTTP 201`), pero registra la notificación como diferida (`notification_deferred`) para enviarla asíncronamente más tarde. Así no perdemos ventas por culpa de un servicio secundario.

---

## 3. Sobre el Análisis Teórico y Producción (Parte V)

**P7: Para el fallo "Base de Datos Intermitente", basándonos en el Teorema CAP, ¿cómo se analiza este problema y qué solución se propone?**
**R:** Durante una intermitencia de red (Partición 'P' en CAP), debemos elegir entre Disponibilidad ('A') y Consistencia ('C'). Para una reserva de asientos no podemos elegir disponibilidad porque venderíamos asientos que no existen (sobreventa). Elegimos **Consistencia**: si no podemos confirmar con PostgreSQL, rechazamos la compra (error reintentable). En producción, esto se soluciona usando **Claves de Idempotencia** únicas por petición, para que si el cliente reintenta una compra porque la red falló al responder, la base de datos reconozca la clave y devuelva el resultado anterior sin cobrarle dos veces.

**P8: En la "Condición de Carrera" (dos clientes comprando el último asiento exactamente al mismo tiempo), ¿por qué falla un bloqueo en código y cómo se soluciona?**
**R:** Un bloqueo (Mutex) en el código de Node.js fallará porque tenemos una infraestructura distribuida multinodo; el código se está ejecutando en pods separados que no comparten memoria. La solución de nivel producción debe residir en la capa de datos compartida:
1. Usar un bloqueo pesimista en PostgreSQL (`SELECT ... FOR UPDATE`) o transacciones atómicas (`UPDATE asiento SET estado='VENDIDO' WHERE estado='DISPONIBLE'`).
2. Configurar una restricción única (`UNIQUE CONSTRAINT`) en la base de datos combinando `(id_evento, id_asiento)`. Si ambas instancias intentan guardar el mismo asiento simultáneamente, la base de datos rechazará la segunda transacción protegiendo el invariante del negocio.
