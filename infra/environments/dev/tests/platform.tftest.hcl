mock_provider "aws" {
  mock_data "aws_availability_zones" { defaults = { names = ["eu-central-1a", "eu-central-1b"] } }
  mock_data "aws_partition" { defaults = { partition = "aws" } }
  mock_data "aws_caller_identity" { defaults = { account_id = "123456789012" } }
  mock_data "aws_eks_addon_version" { defaults = { version = "v1.0.0-eksbuild.1" } }
}
variables {
  admin_role_arn           = "arn:aws:iam::123456789012:role/Operator"
  github_oidc_provider_arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
}
run "registry_and_delivery_policy" {
  command = plan
  assert {
    condition     = aws_ecr_repository.app["api"].image_tag_mutability == "IMMUTABLE"
    error_message = "Release image tags must be immutable."
  }
  assert {
    condition     = aws_ecr_repository.app["web"].image_scanning_configuration[0].scan_on_push
    error_message = "Registry scanning must be enabled."
  }
  assert {
    condition     = strcontains(aws_iam_role.delivery.assume_role_policy, "repo:heyiamwahab236/parcelflow:environment:aws-demo")
    error_message = "OIDC must be restricted to this repository's protected environment."
  }
}
run "reject_open_control_plane" {
  command = plan
  variables { operator_cidrs = ["0.0.0.0/0"] }
  expect_failures = [var.operator_cidrs]
}
