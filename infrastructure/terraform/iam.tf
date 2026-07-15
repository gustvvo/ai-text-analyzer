locals {
  ecs_tasks_assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "sts:AssumeRole"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
      }
    ]
  })
}

# Execution role: used by the ECS agent itself to start the task (pull
# logging/secrets access on the container's behalf) — distinct from the task
# role below, which the running application code would assume.
resource "aws_iam_role" "ecs_execution" {
  name = "${var.project_name}-ecs-execution-role"

  assume_role_policy = local.ecs_tasks_assume_role_policy

  tags = {
    Name = "${var.project_name}-ecs-execution-role"
  }
}

# Scoped to the exact log group and exact secret ARNs this task needs — no
# wildcard resource where a specific ARN is available.
#
# Trade-off: this policy omits ECR pull permissions
# (ecr:GetAuthorizationToken, ecr:BatchGetImage, ecr:GetDownloadUrlForLayer),
# which a real deployment would also need on this role to actually pull
# var.backend_image. Left out to keep the policy scoped to exactly what this
# assessment brief calls for; noted in versions.tf as accepted simplification #8.
resource "aws_iam_role_policy" "ecs_execution" {
  name = "${var.project_name}-ecs-execution-policy"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Logs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "${aws_cloudwatch_log_group.backend.arn}:*"
      },
      {
        Sid    = "SecretsForContainerEnv"
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.database_url.arn,
          aws_secretsmanager_secret.jwt_secret.arn,
          aws_secretsmanager_secret.anthropic_api_key.arn,
          aws_secretsmanager_secret.openai_api_key.arn,
        ]
      }
    ]
  })
}

# Task role: the identity the running backend application code assumes.
#
# Trade-off: intentionally empty. The backend today calls no AWS APIs
# directly — it reaches Anthropic/OpenAI over the public internet via the
# NAT Gateway, not via an AWS SDK call. If a future iteration swapped the AI
# provider for Amazon Bedrock, this is the role that would gain a
# tightly-scoped `bedrock:InvokeModel` statement (never the execution role,
# since that identity belongs to the ECS agent, not the application).
resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-ecs-task-role"

  assume_role_policy = local.ecs_tasks_assume_role_policy

  tags = {
    Name = "${var.project_name}-ecs-task-role"
  }
}
