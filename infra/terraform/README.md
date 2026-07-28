# Terraform staging notes
#
# 1. cp terraform.tfvars.example terraform.tfvars
# 2. Set enable_vpc=true (plan first): terraform plan
# 3. Then enable_data / enable_eks as needed
# 4. Sync Secrets Manager → Vault / ExternalSecrets (docs/STAGING.md)
# 5. Never apply from CI; require manual approval
#
# Estimated staging cost (eu-central-1, rough): VPC NAT + EKS nodes + RDS + Redis.
# Destroy after drills: terraform destroy
