# Secrets for JWT signing and the AI provider API keys.
#
# No real secret value is committed anywhere in this repository. Each secret
# below is seeded with a non-functional bootstrap placeholder purely so that
# Secrets Manager has at least one version to hand ECS at container start
# (a secret with zero versions cannot be resolved by the `secrets` block in
# ecs.tf). The real value must be set out-of-band immediately after the
# initial apply, e.g.:
#
#   aws secretsmanager put-secret-value \
#     --secret-id ai-text-analyzer/jwt-secret \
#     --secret-string '<value>'
#
# `lifecycle { ignore_changes = [secret_string] }` on each version resource
# stops a later `terraform apply` from reverting that manual, out-of-band
# rotation back to the placeholder.
#
# Rotation: repeat the `put-secret-value` command with a new value, then
# force ECS to pick it up:
#   aws ecs update-service --cluster <cluster> --service <service> --force-new-deployment
# Automatic rotation via a Secrets Manager-native Lambda rotation function is
# accepted future work, not implemented here to keep the assessment scope
# tight.

resource "aws_secretsmanager_secret" "jwt_secret" {
  name = "${var.project_name}/jwt-secret"

  tags = {
    Name = "${var.project_name}-jwt-secret"
  }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = "REPLACE_OUT_OF_BAND"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name = "${var.project_name}/anthropic-api-key"

  tags = {
    Name = "${var.project_name}-anthropic-api-key"
  }
}

resource "aws_secretsmanager_secret_version" "anthropic_api_key" {
  secret_id     = aws_secretsmanager_secret.anthropic_api_key.id
  secret_string = "REPLACE_OUT_OF_BAND"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# Not wired into the running task's `secrets` block today (AI_PROVIDER
# defaults to anthropic — see ecs.tf), but provisioned so switching
# providers is a one-line environment change plus populating this secret,
# with no infrastructure change required.
resource "aws_secretsmanager_secret" "openai_api_key" {
  name = "${var.project_name}/openai-api-key"

  tags = {
    Name = "${var.project_name}-openai-api-key"
  }
}

resource "aws_secretsmanager_secret_version" "openai_api_key" {
  secret_id     = aws_secretsmanager_secret.openai_api_key.id
  secret_string = "REPLACE_OUT_OF_BAND"

  lifecycle {
    ignore_changes = [secret_string]
  }
}
