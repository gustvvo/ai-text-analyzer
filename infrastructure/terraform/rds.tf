# Generated once by Terraform and never written as a literal anywhere in
# this configuration or in state as plaintext config — it flows straight
# into the DATABASE_URL secret below.
resource "random_password" "db" {
  length  = 24
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnets"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${var.project_name}-db-subnets"
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "PostgreSQL: ingress only from the ECS tasks security group"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from backend tasks only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-rds-sg"
  }
}

# Trade-off: single-AZ RDS. Roughly halves cost versus Multi-AZ but accepts
# an availability gap on AZ failure (no automatic failover). A production
# deployment would set multi_az = true.
resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = "ai_text_analyzer"
  username = "postgres"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  multi_az               = false
  publicly_accessible    = false

  # Trade-off: assessment-only setting so `terraform destroy` doesn't hang
  # waiting on a final snapshot. A production deployment would set this to
  # false and let Terraform take a final snapshot on destroy.
  # Encryption at rest with the AWS-managed KMS key: free, no operational
  # cost, and input_text can contain user PII.
  storage_encrypted = true

  skip_final_snapshot = true

  tags = {
    Name = "${var.project_name}-db"
  }
}

resource "aws_secretsmanager_secret" "database_url" {
  name = "${var.project_name}/database-url"

  tags = {
    Name = "${var.project_name}-database-url"
  }
}

# The only secret populated by Terraform itself: it is entirely derived from
# the random_password resource above plus RDS's own computed endpoint —
# never a hand-typed literal.
resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgres://${aws_db_instance.main.username}:${random_password.db.result}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}"
}
