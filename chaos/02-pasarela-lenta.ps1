$ErrorActionPreference = 'Stop'
kubectl set env deployment/pagos FIXED_DELAY_MS=20000
kubectl rollout status deployment/pagos --timeout=120s
Write-Host 'Pagos responde en 20 s; Reservas debe agotar timeout, reintentar y abrir el circuito.'
