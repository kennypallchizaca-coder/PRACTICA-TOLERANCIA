# Guion de Demostración en Vivo (Paso a Paso)

Este documento es tu guía exacta para la presentación. Sigue los pasos en estricto orden. Se recomienda tener **3 terminales de PowerShell abiertas**:
*   **Terminal 1 (Comandos):** Para ejecutar los scripts de la carpeta `chaos\`.
*   **Terminal 2 (Monitoreo):** Para ver el estado de los pods en vivo.
*   **Terminal 3 (Port-Forward):** Para mantener la conexión abierta al Gateway.

---

## Paso 0: Preparación y Estado Base (2 min)

**1. Abre la Terminal 3 y ejecuta el Port-Forward:**
```powershell
kubectl port-forward service/api-gateway 8080:3001
```
*(Déjala corriendo y minimízala. Esto simula el tráfico de entrada a nuestro clúster).*

**2. En la Terminal 2, muestra la distribución inicial de los nodos y pods:**
```powershell
kubectl get nodes
kubectl get pods -o wide
```
**Qué decir:** *"Como pueden ver, tenemos 3 nodos en Kubernetes (1 master y 2 workers). Nuestros servicios críticos, como Reservas e Inventario, están distribuidos en nodos distintos gracias a las reglas de Anti-Affinity. Si un worker físico muere, el sistema no se cae."*

**3. Deja la Terminal 2 en modo monitoreo en vivo:**
```powershell
kubectl get pods -w
```

**4. En la Terminal 1, ejecuta una compra normal para probar que el flujo base funciona:**
```powershell
curl.exe -X POST http://localhost:8080/api/comprar -H "Content-Type: application/json" -d '{"seatId":"BASE-001","amount":25,"email":"test@example.com"}'
```
**Qué decir:** *"El sistema está sano y responde correctamente con un código HTTP 201 (Reserva confirmada)."*

---

## Paso 1: Fallo 1 - Inventario Fantasma (Disponibilidad) (2 min)

**1. En la Terminal 1, inyecta el fallo (eliminará un pod):**
```powershell
.\chaos\01-inventario-fantasma.ps1
```
*(Inmediatamente después de lanzar ese comando, vuelve a ejecutar una compra)*
```powershell
curl.exe -X POST http://localhost:8080/api/comprar -H "Content-Type: application/json" -d '{"seatId":"F1-002","amount":25,"email":"test@example.com"}'
```

**2. Observa la Terminal 2 (Monitoreo):**
Se verá cómo un pod de inventario se elimina (`Terminating`) y nace uno nuevo automáticamente (`ContainerCreating`).

**Qué decir:** *"Acabamos de matar un pod de Inventario en pleno vuelo. Gracias a Kubernetes y a que tenemos 2 réplicas, el tráfico se enrutó a la réplica viva y la compra se procesó con éxito porque aplicamos un patrón **Retry**. Además, Kubernetes ya está levantando el pod faltante para recuperar la alta disponibilidad."*

---

## Paso 2: Fallo 2 - Pasarela Lenta (Latencia) (3 min)

**1. En la Terminal 1, inyecta el fallo (hace que Pagos tarde 20 segundos):**
```powershell
.\chaos\02-pasarela-lenta.ps1
```

**2. Intenta hacer una compra en la Terminal 1:**
```powershell
curl.exe -X POST http://localhost:8080/api/comprar -H "Content-Type: application/json" -d '{"seatId":"F2-003","amount":25,"email":"test@example.com"}'
```

**Qué decir:** *"Simulamos que la pasarela de pagos externa colapsó y ahora tarda 20 segundos en responder. En un sistema frágil, nuestra aplicación se congelaría 20 segundos esperando por cada cliente. Nosotros implementamos un **Timeout de 2.5s** y un patrón de **Circuit Breaker**.* (Muestra cómo la consola devuelve un error rápido, sin colgarse 20 segundos). *El sistema rechaza la petición rápidamente liberando los hilos, y el Circuit Breaker corta el paso hacia el servicio degradado para no asfixiarlo más."*

---

## Paso 3: Fallo 3 - Diluvio de Peticiones (Sobrecarga) (3 min)

**1. En la Terminal 1, inyecta el ataque de tráfico masivo con k6:**
```powershell
.\chaos\03-diluvio-peticiones.ps1
```

**2. Mientras k6 dispara las peticiones, cancela el monitoreo en la Terminal 2 (Ctrl+C) y revisa los logs del Gateway:**
```powershell
kubectl logs -f deployment/api-gateway
```

**Qué decir:** *"Estamos inyectando una carga masiva simulando 80 usuarios simultáneos. Aquí entra en juego el patrón **Bulkhead**. Limitamos el API Gateway a 40 conexiones simultáneas por pod. Como ven en los logs, las peticiones que superan nuestro límite operativo son rechazadas instantáneamente de forma controlada con un error `503 Retry-After`. Esto salva nuestro servidor evitando un colapso total por falta de memoria."*

---

## Paso 4: Fallo 4 - Correo Perdido (Fallo No Crítico) (2 min)

**1. En la Terminal 1, inyecta la caída total del correo (escala a 0 pods):**
```powershell
.\chaos\04-correo-perdido.ps1
```

**2. Intenta hacer una compra:**
```powershell
curl.exe -X POST http://localhost:8080/api/comprar -H "Content-Type: application/json" -d '{"seatId":"F4-004","amount":25,"email":"test@example.com"}'
```

**Qué decir:** *"El servicio de Notificaciones está totalmente caído (0 réplicas). Sin embargo, vemos que la compra nos devuelve un **HTTP 201 Exitoso**. Esto es por el patrón **Fallback** (Degradación Grácil). Como enviar un correo no es vital para asegurar la venta, el sistema confirma la reserva y deja el correo marcado como 'diferido' para enviarlo cuando el servicio regrese. Priorizamos la venta sobre los procesos secundarios."*

---

## Paso 5: Restauración Final y Cierre (1 min)

**1. En la Terminal 1, restaura todo a la normalidad:**
```powershell
.\chaos\restaurar.ps1
```

**2. En la Terminal 2, verifica que todo esté sano (`Ready 1/1` o `2/2`):**
```powershell
kubectl get pods
```

**Qué decir (Conclusión de la presentación):** *"Ejecutamos el script de restauración. Como observan, todos los servicios han vuelto a la normalidad de forma transparente. Hemos demostrado cómo Kubernetes, sumado a los patrones de Timeout, Circuit Breaker, Bulkhead y Fallback, mantienen vivo nuestro núcleo de negocio a pesar del caos y los fallos de terceros. Muchas gracias."*
