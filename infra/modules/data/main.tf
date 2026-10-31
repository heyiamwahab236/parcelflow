variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "node_security_group_id" { type = string }
variable "multi_az" { type = bool }
resource "aws_kms_key" "data" {
  description             = "${var.name} database and secrets encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}
resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}
resource "aws_security_group" "database" {
  name        = "${var.name}-database"
  description = "PostgreSQL only from EKS application nodes"
  vpc_id      = var.vpc_id
}
resource "aws_vpc_security_group_ingress_rule" "database" {
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = var.node_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "EKS nodes to PostgreSQL"
}
resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-postgres17"
  family = "postgres17"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_connections"
    value = "1"
  }
}
resource "aws_db_instance" "this" {
  #checkov:skip=CKV_AWS_157:Dev explicitly defaults to Single-AZ to reduce cost. Enable multi_az_database and validate failover before requiring HA.
  identifier                          = var.name
  engine                              = "postgres"
  engine_version                      = "17"
  instance_class                      = "db.t4g.micro"
  allocated_storage                   = 20
  max_allocated_storage               = 100
  storage_type                        = "gp3"
  storage_encrypted                   = true
  kms_key_id                          = aws_kms_key.data.arn
  db_name                             = "parcelflow"
  username                            = "parcelflow_admin"
  manage_master_user_password         = true
  iam_database_authentication_enabled = true
  master_user_secret_kms_key_id       = aws_kms_key.data.arn
  db_subnet_group_name                = aws_db_subnet_group.this.name
  vpc_security_group_ids              = [aws_security_group.database.id]
  parameter_group_name                = aws_db_parameter_group.this.name
  publicly_accessible                 = false
  multi_az                            = var.multi_az
  backup_retention_period             = 7
  copy_tags_to_snapshot               = true
  deletion_protection                 = true
  skip_final_snapshot                 = false
  final_snapshot_identifier           = "${var.name}-final"
  auto_minor_version_upgrade          = true
  enabled_cloudwatch_logs_exports     = ["postgresql", "upgrade"]
}
resource "aws_secretsmanager_secret" "app" {
  name                    = "${var.name}/database"
  description             = "Restricted application role; initialized by the migration job"
  kms_key_id              = aws_kms_key.data.arn
  recovery_window_in_days = 7
}
resource "aws_secretsmanager_secret" "operator" {
  name                    = "${var.name}/operator"
  description             = "Operator token; initialized by the migration job"
  kms_key_id              = aws_kms_key.data.arn
  recovery_window_in_days = 7
}
resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "${var.name}-database-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  dimensions          = { DBInstanceIdentifier = aws_db_instance.this.id }
  alarm_description   = "Database CPU above 80% for 15 minutes; attach SNS actions before production use"
}
resource "aws_cloudwatch_metric_alarm" "database_storage" {
  alarm_name          = "${var.name}-database-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Minimum"
  threshold           = 5368709120
  dimensions          = { DBInstanceIdentifier = aws_db_instance.this.id }
  alarm_description   = "Less than 5 GiB free database storage"
}
output "host" { value = aws_db_instance.this.address }
output "app_secret_arn" { value = aws_secretsmanager_secret.app.arn }
output "operator_secret_arn" { value = aws_secretsmanager_secret.operator.arn }
output "master_secret_arn" { value = aws_db_instance.this.master_user_secret[0].secret_arn }
output "kms_key_arn" { value = aws_kms_key.data.arn }
