data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
locals { arn = "arn:${data.aws_partition.current.partition}" }
module "network" {
  source   = "../../modules/network"
  name     = var.name
  vpc_cidr = "10.42.0.0/16"
}
module "cluster" {
  source             = "../../modules/cluster"
  name               = var.name
  subnet_ids         = module.network.private_subnets
  kubernetes_version = var.kubernetes_version
  admin_role_arn     = var.admin_role_arn
  deploy_role_arn    = aws_iam_role.delivery.arn
  operator_cidrs     = var.operator_cidrs
}
module "database" {
  source                 = "../../modules/data"
  name                   = var.name
  vpc_id                 = module.network.vpc_id
  subnet_ids             = module.network.database_subnets
  node_security_group_id = module.cluster.node_security_group_id
  multi_az               = var.multi_az_database
}
resource "aws_kms_key" "images" {
  description             = "${var.name} container registry encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}
resource "aws_ecr_repository" "app" {
  for_each             = toset(["api", "web"])
  name                 = "${var.name}/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.images.arn
  }
}
resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({ rules = [{
    rulePriority = 1, description = "Expire untagged images after 7 days",
    selection    = { tagStatus = "untagged", countType = "sinceImagePushed", countUnit = "days", countNumber = 7 },
    action       = { type = "expire" }
  }] })
}
resource "aws_iam_role" "delivery" {
  name = "${var.name}-github-delivery"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow", Action = "sts:AssumeRoleWithWebIdentity",
    Principal = { Federated = var.github_oidc_provider_arn },
    Condition = { StringEquals = {
      "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:aws-demo"
    } }
  }] })
}
resource "aws_iam_role_policy" "delivery" {
  role = aws_iam_role.delivery.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
    { Effect = "Allow", Action = ["ecr:BatchCheckLayerAvailability", "ecr:CompleteLayerUpload", "ecr:UploadLayerPart", "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"], Resource = [for repo in aws_ecr_repository.app : repo.arn] },
    { Effect = "Allow", Action = ["eks:DescribeCluster"], Resource = "${local.arn}:eks:${var.region}:${data.aws_caller_identity.current.account_id}:cluster/${var.name}" }
  ] })
}
locals {
  pod_trust = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow", Principal = { Service = "pods.eks.amazonaws.com" },
    Action    = ["sts:AssumeRole", "sts:TagSession"],
    Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }, ArnEquals = { "aws:SourceArn" = module.cluster.arn } }
  }] })
}
resource "aws_iam_role" "api" {
  name               = "${var.name}-api"
  assume_role_policy = local.pod_trust
}
resource "aws_iam_role_policy" "api" {
  role = aws_iam_role.api.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = [module.database.app_secret_arn, module.database.operator_secret_arn] },
    { Effect = "Allow", Action = ["kms:Decrypt"], Resource = module.database.kms_key_arn }
  ] })
}
resource "aws_eks_pod_identity_association" "api" {
  cluster_name    = module.cluster.name
  namespace       = "parcelflow"
  service_account = "api"
  role_arn        = aws_iam_role.api.arn
}
resource "aws_iam_role" "migration" {
  name               = "${var.name}-migration"
  assume_role_policy = local.pod_trust
}
resource "aws_iam_role_policy" "migration" {
  role = aws_iam_role.migration.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = [module.database.master_secret_arn, module.database.app_secret_arn, module.database.operator_secret_arn] },
    { Effect = "Allow", Action = ["secretsmanager:PutSecretValue"], Resource = [module.database.app_secret_arn, module.database.operator_secret_arn] },
    { Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = module.database.kms_key_arn }
  ] })
}
resource "aws_eks_pod_identity_association" "migration" {
  cluster_name    = module.cluster.name
  namespace       = "parcelflow"
  service_account = "migration"
  role_arn        = aws_iam_role.migration.arn
}
resource "aws_iam_role" "alb" {
  name               = "${var.name}-load-balancer"
  assume_role_policy = local.pod_trust
}
resource "aws_iam_role_policy" "alb" {
  role   = aws_iam_role.alb.id
  policy = file("${path.module}/../../policies/aws-load-balancer-controller.json")
}
resource "aws_eks_pod_identity_association" "alb" {
  cluster_name    = module.cluster.name
  namespace       = "kube-system"
  service_account = "aws-load-balancer-controller"
  role_arn        = aws_iam_role.alb.arn
}
output "cluster_name" { value = module.cluster.name }
output "region" { value = var.region }
output "vpc_id" { value = module.network.vpc_id }
output "database_host" { value = module.database.host }
output "database_secret_arn" { value = module.database.app_secret_arn }
output "operator_secret_arn" { value = module.database.operator_secret_arn }
output "master_secret_arn" { value = module.database.master_secret_arn }
output "delivery_role_arn" { value = aws_iam_role.delivery.arn }
output "ecr_api_url" { value = aws_ecr_repository.app["api"].repository_url }
output "ecr_web_url" { value = aws_ecr_repository.app["web"].repository_url }
