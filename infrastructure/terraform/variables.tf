variable "project_name" {
  description = "Name prefix applied to all resources"
  type        = string
  default     = "ai-text-analyzer"
}

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "availability_zones" {
  description = "Availability zones used for subnet placement. Supplied via variable (not the aws_availability_zones data source) so `terraform plan` works without any AWS API access."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "backend_image" {
  description = "Container image URI for the backend (ECR repo:tag). Placeholder — override with the real ECR repository URI once an image has been pushed."
  type        = string
  default     = "<AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/ai-text-analyzer-backend:latest"
}

variable "backend_port" {
  description = "Port the backend container listens on"
  type        = number
  default     = 3000
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "backend_cpu" {
  description = "Fargate task CPU units"
  type        = number
  default     = 256
}

variable "backend_memory" {
  description = "Fargate task memory, in MiB"
  type        = number
  default     = 512
}

variable "backend_desired_count" {
  description = "Initial desired ECS task count"
  type        = number
  default     = 1
}

variable "backend_max_count" {
  description = "Maximum ECS task count for CPU-based autoscaling"
  type        = number
  default     = 4
}

variable "cors_origin" {
  description = "Allowed CORS origin for the backend API — the CloudFront domain in production"
  type        = string
  default     = "https://example.com"
}

# --- Credential-less plan support -------------------------------------------
# These two variables exist ONLY so `terraform plan`/`validate` can run on a
# machine with no AWS credentials configured (see versions.tf). They feed the
# aws provider's access_key/secret_key arguments alongside the skip_* flags.
# Override or remove them for any real deployment.
variable "aws_access_key_dummy" {
  description = "Placeholder AWS access key used solely to satisfy the provider during credential-less plan/validate"
  type        = string
  default     = "test"
  sensitive   = true
}

variable "aws_secret_key_dummy" {
  description = "Placeholder AWS secret key used solely to satisfy the provider during credential-less plan/validate"
  type        = string
  default     = "test"
  sensitive   = true
}
