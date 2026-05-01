variable "kube_context" {
  description = "Kubernetes context to use (e.g., minikube)"
  type        = string
  default     = "minikube"
}

variable "namespace" {
  description = "Kubernetes namespace"
  type        = string
  default     = "benchmark"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "development"
}

variable "db_user" {
  description = "PostgreSQL username"
  type        = string
  default     = "postgres"
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL password"
  type        = string
  default     = "postgres"
  sensitive   = true
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "benchmarkdb"
}

variable "dockerhub_username" {
  description = "Docker Hub username for image pulls"
  type        = string
  default     = "yourusername"
}

variable "backend_replicas" {
  description = "Number of backend replicas"
  type        = number
  default     = 2
}

variable "frontend_replicas" {
  description = "Number of frontend replicas"
  type        = number
  default     = 2
}

variable "worker_replicas" {
  description = "Number of worker replicas"
  type        = number
  default     = 2
}
