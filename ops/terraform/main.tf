terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
}

# Variables
variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "region" {
  description = "Cloud provider region"
  type        = string
  default     = "us-east-1"
}

variable "bootstrap_node_count" {
  description = "Number of bootstrap nodes to deploy"
  type        = number
  default     = 3
}

variable "turn_server_count" {
  description = "Number of TURN servers to deploy"
  type        = number
  default     = 2
}

variable "enable_monitoring" {
  description = "Enable Prometheus/Grafana monitoring"
  type        = bool
  default     = true
}

# Outputs
output "bootstrap_nodes" {
  description = "Bootstrap node endpoints"
  value = {
    websocket_endpoints = aws_instance.bootstrap[*].public_dns
    peer_ids           = aws_instance.bootstrap[*].tags["PeerId"]
  }
}

output "turn_servers" {
  description = "TURN server endpoints"
  value = {
    endpoints = aws_instance.turn[*].public_ip
    ports     = [3478, 5349]
  }
}

output "monitoring_dashboard" {
  description = "Monitoring dashboard URL"
  value       = var.enable_monitoring ? "http://${aws_instance.monitoring[0].public_dns}:3000" : "Monitoring disabled"
}
