$ErrorActionPreference = 'Stop'
kubectl scale deployment/notificaciones --replicas=0
kubectl wait --for=delete pod -l app=notificaciones --timeout=90s
Write-Host 'La compra debe responder 201 y Reservas registrar notification_deferred.'
