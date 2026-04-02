# =============================================================================
# General
# =============================================================================

variable "name" {
  description = "Name prefix for all resources"
  type        = string
  default     = "omnigate"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default = {
    Project   = "omnigate"
    ManagedBy = "terraform"
  }
}

# =============================================================================
# Networking
# =============================================================================

variable "vpc_id" {
  description = "VPC ID where resources will be created"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the ALB"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks"
  type        = list(string)
}

# =============================================================================
# Container
# =============================================================================

variable "container_image" {
  description = "Docker image repository (without tag)"
  type        = string
  default     = "omnigate"
}

variable "container_image_tag" {
  description = "Docker image tag"
  type        = string
  default     = "1.2.0"
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

variable "task_cpu" {
  description = "Fargate task CPU units (1024 = 1 vCPU)"
  type        = string
  default     = "512"
}

variable "task_memory" {
  description = "Fargate task memory in MiB"
  type        = string
  default     = "1024"
}

variable "desired_count" {
  description = "Number of ECS tasks to run"
  type        = number
  default     = 2
}

# =============================================================================
# Database
# =============================================================================

variable "postgres_host" {
  description = "PostgreSQL host"
  type        = string
}

variable "postgres_port" {
  description = "PostgreSQL port"
  type        = number
  default     = 5432
}

variable "postgres_db" {
  description = "PostgreSQL database name"
  type        = string
  default     = "omnigate"
}

# =============================================================================
# Secrets (ARNs for AWS Secrets Manager or SSM Parameter Store)
# =============================================================================

variable "secret_postgres_user_arn" {
  description = "ARN of the secret containing POSTGRES_USER"
  type        = string
}

variable "secret_postgres_password_arn" {
  description = "ARN of the secret containing POSTGRES_PASSWORD"
  type        = string
}

variable "secret_redis_url_arn" {
  description = "ARN of the secret containing REDIS_URL"
  type        = string
}

variable "secret_jwt_arn" {
  description = "ARN of the secret containing JWT_SECRET"
  type        = string
}

variable "secret_encryption_key_arn" {
  description = "ARN of the secret containing ENCRYPTION_KEY"
  type        = string
}

variable "secret_github_client_id_arn" {
  description = "ARN of the secret containing GITHUB_CLIENT_ID"
  type        = string
}

variable "secret_github_client_secret_arn" {
  description = "ARN of the secret containing GITHUB_CLIENT_SECRET"
  type        = string
}
