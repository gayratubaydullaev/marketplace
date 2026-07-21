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
  description = "Create EKS only after VPC/IAM wiring is complete. Default false — no cloud apply required."
  type        = bool
  default     = false
}

variable "private_subnet_ids" {
  type    = list(string)
  default = []
}

variable "eks_cluster_role_arn" {
  type    = string
  default = ""
}

# Documented production modules. Uncomment and supply remote state / IAM before apply.
# This file is intentionally apply-safe with enable_eks=false and empty module blocks disabled.

locals {
  name_prefix = var.cluster_name
  private_subnets = ["10.40.1.0/24", "10.40.2.0/24", "10.40.3.0/24"]
  public_subnets  = ["10.40.101.0/24", "10.40.102.0/24", "10.40.103.0/24"]
}

# --- VPC (template) ---
# module "vpc" {
#   source  = "terraform-aws-modules/vpc/aws"
#   version = "~> 5.0"
#   name    = local.name_prefix
#   cidr    = var.vpc_cidr
#   azs     = var.availability_zones
#   private_subnets = local.private_subnets
#   public_subnets  = local.public_subnets
#   enable_nat_gateway = true
#   single_nat_gateway = false
# }

# --- RDS PostgreSQL Multi-AZ (template) ---
# module "rds" {
#   source  = "terraform-aws-modules/rds/aws"
#   version = "~> 6.0"
#   identifier     = "${local.name_prefix}-postgres"
#   engine         = "postgres"
#   engine_version = "16"
#   instance_class = var.database_instance_class
#   multi_az       = true
#   allocated_storage = 100
#   storage_encrypted = true
# }

# --- ElastiCache Redis (template) ---
# module "elasticache" {
#   source  = "terraform-aws-modules/elasticache/aws"
#   version = "~> 1.0"
#   replication_group_id = "${local.name_prefix}-redis"
#   node_type            = var.redis_node_type
#   num_cache_clusters   = 3
#   automatic_failover_enabled = true
# }

# --- OpenSearch (template) ---
# resource "aws_opensearch_domain" "search" {
#   domain_name    = "${local.name_prefix}-search"
#   engine_version = "OpenSearch_2.11"
#   cluster_config {
#     instance_type          = "r6g.large.search"
#     instance_count         = 3
#     zone_awareness_enabled = true
#   }
#   encrypt_at_rest { enabled = true }
#   node_to_node_encryption { enabled = true }
# }

# --- S3 media bucket (template) ---
# resource "aws_s3_bucket" "media" {
#   bucket = "${local.name_prefix}-media"
# }
# resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
#   bucket = aws_s3_bucket.media.id
#   rule {
#     apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
#   }
# }

# --- Secrets Manager placeholders ---
# resource "aws_secretsmanager_secret" "app" {
#   name = "${local.name_prefix}/app"
# }

resource "aws_eks_cluster" "marketplace" {
  count    = var.enable_eks && var.eks_cluster_role_arn != "" && length(var.private_subnet_ids) > 0 ? 1 : 0
  name     = var.cluster_name
  role_arn = var.eks_cluster_role_arn
  vpc_config {
    subnet_ids = var.private_subnet_ids
  }
}

output "notes" {
  value = "Templates for VPC/RDS/ElastiCache/OpenSearch/S3/Secrets. Set enable_eks=true only with real IAM + subnets. Do not apply in CI."
}

output "slo_targets" {
  value = {
    api_p95_cached_ms = 100
    api_p95_db_ms     = 300
    uptime_sla        = "99.99%"
    rto_minutes       = 15
    rpo_minutes       = 1
  }
}
