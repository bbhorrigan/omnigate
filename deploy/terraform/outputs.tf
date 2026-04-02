# =============================================================================
# Outputs
# =============================================================================

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.omnigate.dns_name
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.omnigate.name
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.omnigate.name
}
