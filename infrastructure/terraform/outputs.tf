output "alb_dns_name" {
  description = "Public DNS name of the Application Load Balancer (backend API entry point)"
  value       = aws_lb.main.dns_name
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain serving the frontend"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "backend_image" {
  description = "Backend container image currently referenced by the task definition (echoes var.backend_image)"
  value       = var.backend_image
}

output "rds_endpoint" {
  description = "RDS connection endpoint (host:port) — sensitive so it isn't printed to logs/CI output by default"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}
