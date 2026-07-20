terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "eu-central-1"
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
  default = "db.r6g.large"
}

variable "redis_node_type" {
  type    = string
  default = "cache.r6g.large"
}

variable "enable_eks" {
  description = "Create the EKS skeleton only after VPC and IAM wiring is complete."
  type        = bool
  default     = false
}

# Module placeholders: pin module versions and supply remote-state/IAM values
# before uncommenting. Keeping these here documents the production boundary
# without creating cloud resources in a fresh checkout.
#
# module "vpc" {
#   source  = "terraform-aws-modules/vpc/aws"
#   version = "~> 5.0"
#   name    = var.cluster_name
#   cidr    = var.vpc_cidr
#   azs     = var.availability_zones
#   private_subnets = ["10.40.1.0/24", "10.40.2.0/24", "10.40.3.0/24"]
#   public_subnets  = ["10.40.101.0/24", "10.40.102.0/24", "10.40.103.0/24"]
# }
#
# module "rds" {
#   source  = "terraform-aws-modules/rds/aws"
#   version = "~> 6.0"
#   identifier     = "${var.cluster_name}-postgres"
#   engine         = "postgres"
#   instance_class = var.database_instance_class
#   multi_az       = true
# }
#
# module "elasticache" {
#   source  = "terraform-aws-modules/elasticache/aws"
#   version = "~> 1.0"
#   replication_group_id = "${var.cluster_name}-redis"
#   node_type            = var.redis_node_type
#   num_cache_clusters   = 2
# }

resource "aws_eks_cluster" "marketplace" {
  count    = var.enable_eks ? 1 : 0
  name     = var.cluster_name
  role_arn = "arn:aws:iam::000000000000:role/eksClusterRole"
  vpc_config {
    subnet_ids = []
  }
}

output "notes" {
  value = "Wire the documented VPC, RDS, ElastiCache modules and IAM before setting enable_eks=true."
}
