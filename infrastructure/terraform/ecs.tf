resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = {
    Name = "${var.project_name}-cluster"
  }
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.project_name}-backend"
  retention_in_days = 14

  tags = {
    Name = "${var.project_name}-backend-logs"
  }
}

resource "aws_security_group" "ecs" {
  name        = "${var.project_name}-ecs-sg"
  description = "Backend tasks: ingress only from the ALB security group"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Backend port from the ALB only"
    from_port       = var.backend_port
    to_port         = var.backend_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-ecs-sg"
  }
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.project_name}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = var.backend_image
      essential = true

      portMappings = [
        {
          containerPort = var.backend_port
          protocol      = "tcp"
        }
      ]

      # Non-secret configuration only. AI_PROVIDER=anthropic is the
      # documented production choice; switching to "openai" only requires
      # this value plus the matching secret to change — the app already
      # supports both providers via AI_PROVIDER.
      environment = [
        { name = "PORT", value = tostring(var.backend_port) },
        { name = "CORS_ORIGIN", value = var.cors_origin },
        { name = "AI_PROVIDER", value = "anthropic" },
        { name = "ANTHROPIC_MODEL", value = "claude-sonnet-4-5" },
        { name = "OPENAI_MODEL", value = "gpt-4o-mini" },
        { name = "AI_TIMEOUT_MS", value = "30000" },
        { name = "AI_MAX_RETRIES", value = "2" },
        { name = "AI_MAX_OUTPUT_TOKENS", value = "1024" },
        { name = "RATE_LIMIT_ANALYZE_PER_MIN", value = "10" },
        { name = "RATE_LIMIT_AUTH_PER_MIN", value = "5" },
      ]

      # Secret-bearing values are resolved from Secrets Manager by the ECS
      # agent at container start, using the execution role below — they are
      # never placed in `environment` and never appear in Terraform state
      # as plaintext.
      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
        { name = "ANTHROPIC_API_KEY", valueFrom = aws_secretsmanager_secret.anthropic_api_key.arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "backend"
        }
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-backend-task"
  }
}

resource "aws_ecs_service" "backend" {
  name            = "${var.project_name}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.backend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = var.backend_port
  }

  depends_on = [aws_lb_listener.http]

  tags = {
    Name = "${var.project_name}-backend-service"
  }
}

resource "aws_appautoscaling_target" "backend" {
  max_capacity       = var.backend_max_count
  min_capacity       = var.backend_desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Trade-off: scaling on CPU 70% is a proxy for AI-request bursts. The real
# driver of load for this app is upstream LLM latency/queueing, not CPU
# utilization on the backend container itself. A production system would
# scale on a custom CloudWatch metric instead (e.g. in-flight AI requests or
# an SQS queue depth if the /analyze endpoint moved to an async
# queue-and-worker model) — noted here as future work.
resource "aws_appautoscaling_policy" "backend_cpu" {
  name               = "${var.project_name}-cpu-tracking"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend.resource_id
  scalable_dimension = aws_appautoscaling_target.backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
