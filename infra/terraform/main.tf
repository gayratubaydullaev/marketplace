# Gayrat Marketplace — AWS staging/prod Terraform
#
# Safe by default: enable_eks / enable_vpc / enable_data = false → plan only outputs notes.
# Do not apply in CI. Staging: copy terraform.tfvars.example → terraform.tfvars.

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

  default_tags {
    tags = {
      Project     = "gayrat-marketplace"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

locals {
  name_prefix     = var.cluster_name
  private_subnets = ["10.40.1.0/24", "10.40.2.0/24", "10.40.3.0/24"]
  public_subnets  = ["10.40.101.0/24", "10.40.102.0/24", "10.40.103.0/24"]
  azs             = var.availability_zones
}

# --- VPC ---
module "vpc" {
  count   = var.enable_vpc ? 1 : 0
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = local.name_prefix
  cidr = var.vpc_cidr
  azs  = local.azs

  private_subnets = local.private_subnets
  public_subnets  = local.public_subnets

  enable_nat_gateway   = true
  single_nat_gateway   = var.environment != "production"
  enable_dns_hostnames = true
  enable_dns_support   = true
}

# --- EKS ---
module "eks" {
  count   = var.enable_eks && var.enable_vpc ? 1 : 0
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = var.eks_version

  vpc_id     = module.vpc[0].vpc_id
  subnet_ids = module.vpc[0].private_subnets

  cluster_endpoint_public_access = var.environment != "production"

  eks_managed_node_groups = {
    default = {
      instance_types = var.eks_node_instance_types
      min_size       = var.eks_node_min
      max_size       = var.eks_node_max
      desired_size   = var.eks_node_desired
    }
  }
}

# --- RDS PostgreSQL Multi-AZ ---
module "rds" {
  count   = var.enable_data && var.enable_vpc ? 1 : 0
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.0"

  identifier     = "${local.name_prefix}-postgres"
  engine         = "postgres"
  engine_version = "16"
  family         = "postgres16"
  instance_class = var.database_instance_class

  allocated_storage     = 100
  max_allocated_storage = 500
  storage_encrypted     = true
  multi_az              = true

  db_name  = "marketplace"
  username = "marketplace"
  port     = 5432

  create_db_subnet_group = true
  subnet_ids             = module.vpc[0].private_subnets
  vpc_security_group_ids = [aws_security_group.data[0].id]

  backup_retention_period = 7
  deletion_protection     = var.environment == "production"
  skip_final_snapshot     = var.environment != "production"
}

# --- ElastiCache Redis ---
resource "aws_elasticache_subnet_group" "redis" {
  count      = var.enable_data && var.enable_vpc ? 1 : 0
  name       = "${local.name_prefix}-redis"
  subnet_ids = module.vpc[0].private_subnets
}

resource "aws_elasticache_replication_group" "redis" {
  count                      = var.enable_data && var.enable_vpc ? 1 : 0
  replication_group_id       = "${local.name_prefix}-redis"
  description                = "Gayrat Redis"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
  engine                     = "redis"
  engine_version             = "7.1"
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.redis[0].name
  security_group_ids         = [aws_security_group.data[0].id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}

resource "aws_security_group" "data" {
  count       = var.enable_vpc ? 1 : 0
  name        = "${local.name_prefix}-data"
  description = "RDS/Redis access from private subnets"
  vpc_id      = module.vpc[0].vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }
  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# --- S3 media ---
resource "aws_s3_bucket" "media" {
  count  = var.enable_data ? 1 : 0
  bucket = "${local.name_prefix}-${var.environment}-media"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  count  = var.enable_data ? 1 : 0
  bucket = aws_s3_bucket.media[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  count  = var.enable_data ? 1 : 0
  bucket = aws_s3_bucket.media[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- Secrets Manager shell ---
resource "aws_secretsmanager_secret" "app" {
  count = var.enable_data ? 1 : 0
  name  = "${local.name_prefix}/${var.environment}/app"
}

# Legacy gated single-resource EKS (kept for custom IAM/subnet wiring)
resource "aws_eks_cluster" "marketplace_legacy" {
  count    = var.enable_eks && !var.enable_vpc && var.eks_cluster_role_arn != "" && length(var.private_subnet_ids) > 0 ? 1 : 0
  name     = var.cluster_name
  role_arn = var.eks_cluster_role_arn
  vpc_config {
    subnet_ids = var.private_subnet_ids
  }
}

output "notes" {
  value = "Set enable_vpc/enable_eks/enable_data in tfvars for staging. Defaults create nothing billable."
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

output "vpc_id" {
  value = try(module.vpc[0].vpc_id, null)
}

output "eks_cluster_name" {
  value = try(module.eks[0].cluster_name, null)
}

output "rds_endpoint" {
  value     = try(module.rds[0].db_instance_endpoint, null)
  sensitive = true
}

output "redis_primary_endpoint" {
  value     = try(aws_elasticache_replication_group.redis[0].primary_endpoint_address, null)
  sensitive = true
}

output "media_bucket" {
  value = try(aws_s3_bucket.media[0].bucket, null)
}

output "secrets_arn" {
  value     = try(aws_secretsmanager_secret.app[0].arn, null)
  sensitive = true
}
