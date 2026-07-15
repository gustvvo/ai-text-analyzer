# Secrets for JWT signing and the AI provider API keys.
#
# No real secret value is ever placed in Terraform state or committed to git.
# Each secret below is created as an empty secret resource; values are set
# exclusively out-of-band via `aws secretsmanager put-secret-value`, e.g.:
#
#   aws secretsmanager put-secret-value \
#     --secret-id ai-text-analyzer/jwt-secret \
#     --secret-string '<value>'
#
# Rotation: repeat the `put-secret-value` command with a new value, then
# force ECS to pick it up:
#   aws ecs update-service --cluster <cluster> --service <service> --force-new-deployment
#
# Automatic rotation via a Secrets Manager-native Lambda rotation function is
# accepted future work, not implemented here to keep the assessment scope tight.

resource "aws_secretsmanager_secret" "jwt_secret" {
  name = "${var.project_name}/jwt-secret"

  tags = {
    Name = "${var.project_name}-jwt-secret"
  }
}

resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name = "${var.project_name}/anthropic-api-key"

  tags = {
    Name = "${var.project_name}-anthropic-api-key"
  }
}

resource "aws_secretsmanager_secret" "openai_api_key" {
  name = "${var.project_name}/openai-api-key"

  tags = {
    Name = "${var.project_name}-openai-api-key"
  }
}
