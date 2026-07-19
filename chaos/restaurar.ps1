$ErrorActionPreference = 'Stop'
kubectl set env deployment/pagos FIXED_DELAY_MS-
kubectl scale deployment/notificaciones --replicas=1
kubectl delete job k6-load --ignore-not-found
kubectl rollout status deployment/pagos --timeout=120s
kubectl rollout status deployment/notificaciones --timeout=120s
kubectl get pods -o wide
