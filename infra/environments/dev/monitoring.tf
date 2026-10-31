resource "aws_iam_role" "observability" {
  name               = "${var.name}-observability"
  assume_role_policy = local.pod_trust
}
resource "aws_iam_role_policy_attachment" "observability" {
  role       = aws_iam_role.observability.name
  policy_arn = "${local.arn}:iam::aws:policy/CloudWatchAgentServerPolicy"
}
resource "aws_eks_pod_identity_association" "observability" {
  for_each        = toset(["cloudwatch-agent", "fluent-bit"])
  cluster_name    = module.cluster.name
  namespace       = "amazon-cloudwatch"
  service_account = each.key
  role_arn        = aws_iam_role.observability.arn
}
resource "aws_cloudwatch_log_group" "containers" {
  for_each          = toset(["application", "host", "dataplane", "performance"])
  name              = "/aws/containerinsights/${var.name}/${each.key}"
  retention_in_days = 14
}
data "aws_eks_addon_version" "observability" {
  addon_name         = "amazon-cloudwatch-observability"
  kubernetes_version = var.kubernetes_version
  most_recent        = true
}
resource "aws_eks_addon" "observability" {
  cluster_name  = module.cluster.name
  addon_name    = "amazon-cloudwatch-observability"
  addon_version = data.aws_eks_addon_version.observability.version
  depends_on    = [module.cluster, aws_cloudwatch_log_group.containers, aws_eks_pod_identity_association.observability, aws_iam_role_policy_attachment.observability]
}
resource "aws_cloudwatch_log_metric_filter" "api_errors" {
  name           = "${var.name}-api-errors"
  log_group_name = aws_cloudwatch_log_group.containers["application"].name
  pattern        = "{ $.level = \"error\" || $.log = \"*level*error*\" }"
  metric_transformation {
    name      = "ApplicationErrors"
    namespace = "ParcelFlow/${var.name}"
    value     = "1"
  }
}
resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "${var.name}-api-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ApplicationErrors"
  namespace           = "ParcelFlow/${var.name}"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_description   = "Five application errors in five minutes; configure SNS actions for notifications"
}
resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = var.name
  dashboard_body = jsonencode({ widgets = [{
    type = "metric", x = 0, y = 0, width = 12, height = 6,
    properties = {
      title   = "Application errors", region = var.region, period = 300, stat = "Sum",
      metrics = [["ParcelFlow/${var.name}", "ApplicationErrors"]]
    }
    }, {
    type = "metric", x = 12, y = 0, width = 12, height = 6,
    properties = {
      title   = "Database CPU", region = var.region, period = 300, stat = "Average",
      metrics = [["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.name]]
    }
  }] })
}
