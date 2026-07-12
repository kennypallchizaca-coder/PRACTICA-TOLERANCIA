# Sistema de Venta de Entradas - Tolerancia a Fallos

Este repositorio contiene la arquitectura de microservicios para un sistema de venta de entradas, diseñado para demostrar alta disponibilidad y tolerancia a fallos.

## Arquitectura

El sistema está compuesto por 6 componentes principales:
- **API Gateway** (Node.js/Express)
- **Servicio de Reservas** (Core) (Node.js/Express)
- **Servicio de Inventario** (Node.js/Express)
- **Servicio de Pagos** (Stub) (Node.js/Express)
- **Servicio de Notificaciones** (Stub) (Node.js/Express)
- **Base de Datos** (PostgreSQL)

## Instrucciones de Despliegue Local

### Requisitos Previos

Asegúrese de tener instaladas las siguientes herramientas en su entorno local:
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (o Docker Engine)
- [kind (Kubernetes IN Docker)](https://kind.sigs.k8s.io/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)

### Paso 1: Construcción de Imágenes Locales

Construya las imágenes de Docker para cada uno de los microservicios ejecutando los siguientes comandos desde la raíz del proyecto:

```bash
# API Gateway
docker build -t api-gateway:latest ./api-gateway

# Servicio de Reservas
docker build -t reservas:latest ./reservas

# Servicio de Inventario
docker build -t inventario:latest ./inventario

# Servicio de Pagos (Stub)
docker build -t pagos:latest ./pagos-stub

# Servicio de Notificaciones (Stub)
docker build -t notificaciones:latest ./notificaciones-stub
```

### Paso 2: Creación del Clúster Multi-Nodo

Para simular un entorno realista con tolerancia a fallos, crearemos un clúster con 1 nodo `control-plane` y 2 nodos `worker`.

1. Cree un archivo llamado `kind-config.yaml` con la siguiente configuración:

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
- role: worker
- role: worker
```

2. Cree el clúster utilizando el archivo de configuración:

```bash
kind create cluster --name tolerancia-fallos --config kind-config.yaml
```

### Paso 3: Carga de Imágenes al Clúster

Para que Kubernetes pueda utilizar las imágenes locales recién construidas sin necesidad de subirlas a un registro externo, cárguelas directamente en los nodos del clúster de kind:

```bash
kind load docker-image api-gateway:latest --name tolerancia-fallos
kind load docker-image reservas:latest --name tolerancia-fallos
kind load docker-image inventario:latest --name tolerancia-fallos
kind load docker-image pagos:latest --name tolerancia-fallos
kind load docker-image notificaciones:latest --name tolerancia-fallos
```

### Paso 4: Aplicar Manifiestos

Despliegue toda la infraestructura (Deployments, Services, PersistentVolumeClaims) aplicando los archivos YAML ubicados en el directorio `k8s-manifests/`:

```bash
kubectl apply -f k8s-manifests/
```

### Paso 5: Verificación

Compruebe que todos los pods se están ejecutando correctamente y verifique su distribución a través de los múltiples nodos del clúster:

```bash
# Verificar el estado de los nodos
kubectl get nodes

# Verificar el estado y distribución de los pods
kubectl get pods -o wide
```
