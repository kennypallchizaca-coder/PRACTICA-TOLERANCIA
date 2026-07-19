$ErrorActionPreference = 'Stop'
$pod = kubectl get pod -l app=inventario -o jsonpath='{.items[0].metadata.name}'
Write-Host "Eliminando $pod durante una reserva..."
kubectl delete pod $pod --wait=false
kubectl get pods -l app=inventario -w
