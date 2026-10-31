variable "region" {
  type    = string
  default = "eu-central-1"
}
variable "name" {
  type    = string
  default = "parcelflow-dev"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,24}$", var.name))
    error_message = "Use 3-25 lowercase characters, digits or hyphens."
  }
}
variable "admin_role_arn" {
  type        = string
  description = "Existing operator IAM role ARN, not an STS session ARN."
}
variable "github_repository" {
  type    = string
  default = "heyiamwahab236/parcelflow"
}
variable "github_oidc_provider_arn" {
  type        = string
  description = "Existing token.actions.githubusercontent.com IAM OIDC provider ARN; create once per AWS account."
}
variable "operator_cidrs" {
  type        = list(string)
  default     = []
  description = "Optional fixed public /32 operator/runner addresses. Empty keeps the EKS API private."
  validation {
    condition     = alltrue([for cidr in var.operator_cidrs : can(cidrhost(cidr, 0)) && endswith(cidr, "/32")])
    error_message = "Only individual IPv4 /32 addresses are accepted."
  }
}
variable "kubernetes_version" {
  type    = string
  default = "1.35"
}
variable "multi_az_database" {
  type    = bool
  default = false
}
