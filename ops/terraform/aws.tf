# AWS Provider Configuration
provider "aws" {
  region = var.region
  
  default_tags {
    tags = {
      Project     = "dweb-hosting-network"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# VPC and Networking
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = {
    Name = "dweb-${var.environment}-vpc"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  
  tags = {
    Name = "dweb-${var.environment}-igw"
  }
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  
  map_public_ip_on_launch = true
  
  tags = {
    Name = "dweb-${var.environment}-public-${count.index + 1}"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  
  tags = {
    Name = "dweb-${var.environment}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Security Groups
resource "aws_security_group" "bootstrap" {
  name        = "dweb-${var.environment}-bootstrap"
  description = "Security group for DWeb bootstrap nodes"
  vpc_id      = aws_vpc.main.id
  
  # WebSocket port
  ingress {
    from_port   = 9104
    to_port     = 9104
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "WebSocket for libp2p"
  }
  
  # SSH for management
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SSH"
  }
  
  # Metrics endpoint
  ingress {
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
    description = "Prometheus metrics"
  }
  
  # All outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "dweb-${var.environment}-bootstrap-sg"
  }
}

resource "aws_security_group" "turn" {
  name        = "dweb-${var.environment}-turn"
  description = "Security group for TURN servers"
  vpc_id      = aws_vpc.main.id
  
  # TURN/STUN ports
  ingress {
    from_port   = 3478
    to_port     = 3478
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "TURN TCP"
  }
  
  ingress {
    from_port   = 3478
    to_port     = 3478
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "STUN/TURN UDP"
  }
  
  # TURN TLS
  ingress {
    from_port   = 5349
    to_port     = 5349
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "TURN TLS"
  }
  
  # Relay ports range
  ingress {
    from_port   = 49152
    to_port     = 65535
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "TURN relay ports"
  }
  
  # SSH
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SSH"
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "dweb-${var.environment}-turn-sg"
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
  
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Bootstrap nodes
resource "aws_instance" "bootstrap" {
  count         = var.bootstrap_node_count
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.small"
  
  subnet_id                   = aws_subnet.public[count.index % 2].id
  vpc_security_group_ids      = [aws_security_group.bootstrap.id]
  associate_public_ip_address = true
  
  user_data = templatefile("${path.module}/user-data/bootstrap-node.sh", {
    environment = var.environment
    node_index  = count.index
  })
  
  tags = {
    Name = "dweb-${var.environment}-bootstrap-${count.index + 1}"
    Role = "bootstrap"
  }
}

# TURN servers
resource "aws_instance" "turn" {
  count         = var.turn_server_count
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.medium"
  
  subnet_id                   = aws_subnet.public[count.index % 2].id
  vpc_security_group_ids      = [aws_security_group.turn.id]
  associate_public_ip_address = true
  
  user_data = templatefile("${path.module}/user-data/turn-server.sh", {
    environment = var.environment
    realm       = "dweb.network"
  })
  
  tags = {
    Name = "dweb-${var.environment}-turn-${count.index + 1}"
    Role = "turn"
  }
}

# Monitoring server (optional)
resource "aws_instance" "monitoring" {
  count         = var.enable_monitoring ? 1 : 0
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.medium"
  
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.monitoring.id]
  associate_public_ip_address = true
  
  user_data = file("${path.module}/user-data/monitoring.sh")
  
  tags = {
    Name = "dweb-${var.environment}-monitoring"
    Role = "monitoring"
  }
}

resource "aws_security_group" "monitoring" {
  name        = "dweb-${var.environment}-monitoring"
  description = "Security group for monitoring server"
  vpc_id      = aws_vpc.main.id
  
  # Grafana
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Grafana"
  }
  
  # Prometheus
  ingress {
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
    description = "Prometheus"
  }
  
  # SSH
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SSH"
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "dweb-${var.environment}-monitoring-sg"
  }
}
