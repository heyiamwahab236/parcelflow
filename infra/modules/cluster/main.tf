variable "name" { type = string }
variable "subnet_ids" { type = list(string) }
variable "admin_role_arn" { type = string }
variable "deploy_role_arn" { type = string }
variable "kubernetes_version" { type = string }
variable "operator_cidrs" { type = list(string) }
data "aws_partition" "current" {}
data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
locals { arn = "arn:${data.aws_partition.current.partition}" }
resource "aws_kms_key" "cluster" {
  description             = "${var.name} EKS encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Sid = "AccountKeyAdministration", Effect = "Allow", Principal = { AWS = "${local.arn}:iam::${data.aws_caller_identity.current.account_id}:root" }, Action = "kms:*", Resource = "*" },
    { Sid       = "EncryptClusterLogs", Effect = "Allow", Principal = { Service = "logs.${data.aws_region.current.region}.amazonaws.com" }, Action = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"], Resource = "*",
      Condition = { ArnEquals = { "kms:EncryptionContext:aws:logs:arn" = "${local.arn}:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/eks/${var.name}/cluster" } }
    }
  ] })
}
resource "aws_iam_role" "cluster" {
  name = "${var.name}-cluster"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Principal = { Service = "eks.amazonaws.com" }, Action = "sts:AssumeRole"
  }] })
}
resource "aws_iam_role_policy_attachment" "cluster" {
  role       = aws_iam_role.cluster.name
  policy_arn = "${local.arn}:iam::aws:policy/AmazonEKSClusterPolicy"
}
resource "aws_cloudwatch_log_group" "cluster" {
  name              = "/aws/eks/${var.name}/cluster"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.cluster.arn
}
resource "aws_eks_cluster" "this" {
  name     = var.name
  role_arn = aws_iam_role.cluster.arn
  version  = var.kubernetes_version
  access_config { authentication_mode = "API" }
  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = length(var.operator_cidrs) > 0
    public_access_cidrs     = length(var.operator_cidrs) > 0 ? var.operator_cidrs : null
  }
  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  encryption_config {
    resources = ["secrets"]
    provider { key_arn = aws_kms_key.cluster.arn }
  }
  upgrade_policy { support_type = "STANDARD" }
  depends_on = [aws_iam_role_policy_attachment.cluster, aws_cloudwatch_log_group.cluster]
}
resource "aws_iam_role" "node" {
  name = "${var.name}-node"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole"
  }] })
}
resource "aws_iam_role_policy_attachment" "node" {
  for_each   = toset(["AmazonEKSWorkerNodePolicy", "AmazonEC2ContainerRegistryPullOnly", "AmazonEKS_CNI_Policy"])
  role       = aws_iam_role.node.name
  policy_arn = "${local.arn}:iam::aws:policy/${each.key}"
}
resource "aws_launch_template" "node" {
  name_prefix = "${var.name}-"
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    http_endpoint               = "enabled"
  }
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 30
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }
}
resource "aws_eks_node_group" "this" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "application"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.subnet_ids
  instance_types  = ["t3.medium"]
  ami_type        = "AL2023_x86_64_STANDARD"
  capacity_type   = "ON_DEMAND"
  launch_template {
    id      = aws_launch_template.node.id
    version = aws_launch_template.node.latest_version
  }
  scaling_config {
    desired_size = 2
    min_size     = 2
    max_size     = 4
  }
  update_config { max_unavailable = 1 }
  depends_on = [aws_iam_role_policy_attachment.node]
}
data "aws_eks_addon_version" "this" {
  for_each           = toset(["vpc-cni", "kube-proxy", "coredns", "eks-pod-identity-agent", "metrics-server"])
  addon_name         = each.key
  kubernetes_version = var.kubernetes_version
  most_recent        = true
}
resource "aws_eks_addon" "this" {
  for_each      = data.aws_eks_addon_version.this
  cluster_name  = aws_eks_cluster.this.name
  addon_name    = each.key
  addon_version = each.value.version
  depends_on    = [aws_eks_node_group.this]
}
resource "aws_eks_access_entry" "admin" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = var.admin_role_arn
}
resource "aws_eks_access_policy_association" "admin" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = var.admin_role_arn
  policy_arn    = "${local.arn}:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
  access_scope { type = "cluster" }
  depends_on = [aws_eks_access_entry.admin]
}
resource "aws_eks_access_entry" "deploy" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = var.deploy_role_arn
}
resource "aws_eks_access_policy_association" "deploy" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = var.deploy_role_arn
  policy_arn    = "${local.arn}:eks::aws:cluster-access-policy/AmazonEKSEditPolicy"
  access_scope {
    type       = "namespace"
    namespaces = ["parcelflow"]
  }
  depends_on = [aws_eks_access_entry.deploy]
}
output "name" { value = aws_eks_cluster.this.name }
output "arn" { value = aws_eks_cluster.this.arn }
output "node_security_group_id" { value = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id }
