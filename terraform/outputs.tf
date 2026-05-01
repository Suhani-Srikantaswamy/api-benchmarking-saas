output "namespace" {
  description = "Kubernetes namespace created"
  value       = kubernetes_namespace.benchmark.metadata[0].name
}

output "frontend_nodeport" {
  description = "Frontend NodePort (access via http://$(minikube ip):30080)"
  value       = 30080
}

output "backend_service" {
  description = "Backend ClusterIP service"
  value       = kubernetes_service.backend.metadata[0].name
}
