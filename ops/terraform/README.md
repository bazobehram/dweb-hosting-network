# DWeb Hosting Network - Terraform Infrastructure

This directory contains Terraform configurations for deploying the DWeb Hosting Network infrastructure to AWS.

## 🏗️ Infrastructure Components

### Bootstrap Nodes
- **Count**: 3 (configurable)
- **Instance Type**: t3.small
- **Purpose**: libp2p bootstrap nodes with DHT and circuit relay
- **Ports**: 9104 (WebSocket), 9090 (Metrics)

### TURN Servers
- **Count**: 2 (configurable)  
- **Instance Type**: t3.medium
- **Purpose**: NAT traversal for WebRTC connections
- **Ports**: 3478 (TURN/STUN), 5349 (TURN TLS), 49152-65535 (relay)

### Monitoring (Optional)
- **Count**: 1
- **Instance Type**: t3.medium
- **Purpose**: Prometheus + Grafana monitoring stack
- **Ports**: 3000 (Grafana), 9090 (Prometheus)

## 📋 Prerequisites

1. **Terraform** >= 1.0 installed
2. **AWS CLI** configured with credentials
3. **SSH Key Pair** in AWS for instance access

## 🚀 Deployment

### 1. Initialize Terraform

```bash
cd ops/terraform
terraform init
```

### 2. Create terraform.tfvars

```hcl
# terraform.tfvars
environment            = "prod"
region                 = "us-east-1"
bootstrap_node_count   = 3
turn_server_count      = 2
enable_monitoring      = true
```

### 3. Plan Deployment

```bash
terraform plan
```

### 4. Apply Configuration

```bash
terraform apply
```

## 📊 Outputs

After deployment, Terraform will output:

- **bootstrap_nodes**: WebSocket endpoints and peer IDs
- **turn_servers**: TURN server IPs and ports
- **monitoring_dashboard**: Grafana dashboard URL

Example:
```bash
terraform output
```

```
bootstrap_nodes = {
  peer_ids = [
    "12D3KooW...",
    "12D3KooW...",
    "12D3KooW..."
  ]
  websocket_endpoints = [
    "ec2-xx-xx-xx-xx.compute.amazonaws.com",
    "ec2-yy-yy-yy-yy.compute.amazonaws.com",
    "ec2-zz-zz-zz-zz.compute.amazonaws.com"
  ]
}
turn_servers = {
  endpoints = [
    "44.201.xxx.xxx",
    "44.202.yyy.yyy"
  ]
  ports = [
    3478,
    5349
  ]
}
monitoring_dashboard = "http://ec2-monitoring.compute.amazonaws.com:3000"
```

## 🔧 Configuration

### Environment Variables

Set these in your shell or CI/CD:

```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="us-east-1"
```

### Terraform Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `environment` | Environment name | `dev` |
| `region` | AWS region | `us-east-1` |
| `bootstrap_node_count` | Number of bootstrap nodes | `3` |
| `turn_server_count` | Number of TURN servers | `2` |
| `enable_monitoring` | Enable monitoring stack | `true` |

## 🔍 Monitoring

Access Grafana dashboard:
```bash
terraform output monitoring_dashboard
```

Default credentials:
- Username: `admin`
- Password: Check EC2 instance logs

## 🛠️ Management

### SSH Access

```bash
# Get instance IPs
terraform output bootstrap_nodes

# SSH to bootstrap node
ssh ubuntu@<instance-ip>

# Check service status
pm2 status
pm2 logs dweb-bootstrap
```

### Update Bootstrap Nodes

```bash
# SSH to node
ssh ubuntu@<instance-ip>

# Update code
cd /opt/dweb-bootstrap
git pull  # if using git
pm2 restart dweb-bootstrap
```

### Scale Infrastructure

Edit `terraform.tfvars`:
```hcl
bootstrap_node_count = 5  # increase from 3
```

Apply changes:
```bash
terraform apply
```

## 🗑️ Cleanup

Destroy all infrastructure:

```bash
terraform destroy
```

⚠️ This will permanently delete all resources!

## 📁 File Structure

```
ops/terraform/
├── main.tf              # Main configuration and outputs
├── aws.tf               # AWS provider and resources
├── terraform.tfvars     # Variable values (create this)
├── user-data/
│   ├── bootstrap-node.sh   # Bootstrap node setup script
│   ├── turn-server.sh      # TURN server setup script  
│   └── monitoring.sh       # Monitoring stack setup
├── modules/             # Reusable modules (future)
└── README.md            # This file
```

## 🔐 Security Notes

1. **SSH Keys**: Use AWS key pairs, don't commit private keys
2. **Security Groups**: Review firewall rules before production
3. **TURN Credentials**: Set strong credentials in TURN config
4. **Monitoring Access**: Restrict Grafana access by IP if needed

## 💰 Cost Estimation

Approximate monthly costs (us-east-1):

| Resource | Count | Instance | Monthly Cost |
|----------|-------|----------|--------------|
| Bootstrap nodes | 3 | t3.small | ~$45 |
| TURN servers | 2 | t3.medium | ~$60 |
| Monitoring | 1 | t3.medium | ~$30 |
| **Total** | | | **~$135/month** |

Plus data transfer costs.

## 📚 Additional Resources

- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [libp2p Documentation](https://docs.libp2p.io/)
- [Coturn (TURN Server)](https://github.com/coturn/coturn)

## 🆘 Troubleshooting

### Bootstrap node not starting

```bash
ssh ubuntu@<instance-ip>
pm2 logs dweb-bootstrap
```

### TURN server not working

```bash
ssh ubuntu@<turn-ip>
systemctl status coturn
journalctl -u coturn -f
```

### Can't connect to monitoring

Check security group allows port 3000 from your IP:
```bash
terraform console
> aws_security_group.monitoring.ingress
```

## 🔄 CI/CD Integration

Example GitHub Actions:

```yaml
- name: Deploy Infrastructure
  run: |
    cd ops/terraform
    terraform init
    terraform apply -auto-approve
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```
