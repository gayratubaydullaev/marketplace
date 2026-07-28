variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "environment" {
  type    = string
  default = "staging"
}

variable "cluster_name" {
  type    = string
  default = "gayrat-marketplace"
}

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "availability_zones" {
  type    = list(string)
  default = ["eu-central-1a", "eu-central-1b", "eu-central-1c"]
}

variable "database_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}

variable "enable_vpc" {
  description = "Create VPC + NAT. Default false — no cloud cost."
  type        = bool
  default     = false
}

variable "enable_eks" {
  description = "Create EKS (requires enable_vpc or legacy IAM/subnets)."
  type        = bool
  default     = false
}

variable "enable_data" {
  description = "Create RDS, Redis, S3, Secrets Manager."
  type        = bool
  default     = false
}

variable "eks_version" {
  type    = string
  default = "1.29"
}

variable "eks_node_instance_types" {
  type    = list(string)
  default = ["t3.large"]
}

variable "eks_node_min" {
  type    = number
  default = 2
}

variable "eks_node_max" {
  type    = number
  default = 6
}

variable "eks_node_desired" {
  type    = number
  default = 2
}

variable "private_subnet_ids" {
  type    = list(string)
  default = []
}

variable "eks_cluster_role_arn" {
  type    = string
  default = ""
}
