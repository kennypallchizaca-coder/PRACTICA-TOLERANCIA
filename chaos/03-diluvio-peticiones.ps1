$ErrorActionPreference = 'Stop'
kubectl apply -f "$PSScriptRoot/k6-load.yaml"
kubectl wait --for=condition=complete job/k6-load --timeout=180s
kubectl logs job/k6-load
