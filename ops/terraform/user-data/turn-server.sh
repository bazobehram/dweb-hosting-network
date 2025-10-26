#!/bin/bash
set -e

# TURN Server Setup Script for DWeb Hosting Network
# This script installs and configures Coturn TURN/STUN server for NAT traversal

echo "==================================="
echo "DWeb TURN Server Setup"
echo "==================================="

# Update system
echo "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Coturn
echo "Installing Coturn..."
apt-get install -y coturn

# Enable Coturn service
echo "Enabling Coturn service..."
sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn

# Generate random credentials
TURN_USERNAME="dweb-turn-user"
TURN_PASSWORD=$(openssl rand -base64 32)
TURN_SECRET=$(openssl rand -base64 32)

# Get instance IP
EXTERNAL_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

# Configure Coturn
echo "Configuring Coturn..."
cat > /etc/turnserver.conf << EOF
# DWeb TURN Server Configuration
# Generated: $(date)

# Listening interfaces
listening-ip=0.0.0.0
relay-ip=$EXTERNAL_IP
external-ip=$EXTERNAL_IP

# TURN server ports
listening-port=3478
tls-listening-port=5349

# Relay ports range (for media)
min-port=49152
max-port=65535

# Authentication
lt-cred-mech
user=$TURN_USERNAME:$TURN_PASSWORD
use-auth-secret
static-auth-secret=$TURN_SECRET
realm=dweb-turn.example.com

# Logging
verbose
log-file=/var/log/turnserver.log

# Security
no-multicast-peers
no-loopback-peers
mobility
fingerprint

# Performance
max-bps=1000000
bps-capacity=0
user-quota=0
total-quota=0

# TLS (if using secure connections)
# cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
# pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem

# Disable TLS for now (enable when certificates are ready)
no-tls
no-dtls

# Additional security
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255

# Allow UDP relay
no-tcp-relay
EOF

# Store credentials securely
echo "Storing credentials..."
cat > /root/turn-credentials.txt << EOF
TURN Server Credentials
========================
External IP: $EXTERNAL_IP
TURN URL: turn:$EXTERNAL_IP:3478
STUN URL: stun:$EXTERNAL_IP:3478

Username: $TURN_USERNAME
Password: $TURN_PASSWORD
Secret: $TURN_SECRET

Ice Server Config (JSON):
{
  "urls": ["turn:$EXTERNAL_IP:3478", "stun:$EXTERNAL_IP:3478"],
  "username": "$TURN_USERNAME",
  "credential": "$TURN_PASSWORD"
}
EOF

chmod 600 /root/turn-credentials.txt

# Configure firewall (UFW)
echo "Configuring firewall..."
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 5349/tcp
ufw allow 5349/udp
ufw allow 49152:65535/tcp
ufw allow 49152:65535/udp
ufw --force enable

# Start Coturn
echo "Starting Coturn..."
systemctl restart coturn
systemctl enable coturn

# Wait for service to start
sleep 5

# Verify service status
if systemctl is-active --quiet coturn; then
    echo "✅ Coturn service is running"
else
    echo "❌ Coturn service failed to start"
    systemctl status coturn
    exit 1
fi

# Test TURN server
echo "Testing TURN server connectivity..."
turnutils_stunclient $EXTERNAL_IP 2>&1 || echo "STUN test completed"

# Create monitoring script
cat > /usr/local/bin/turn-health-check.sh << 'HEALTH'
#!/bin/bash
# TURN Server Health Check

STATUS=$(systemctl is-active coturn)
if [ "$STATUS" = "active" ]; then
    echo "OK: Coturn is running"
    exit 0
else
    echo "ERROR: Coturn is not running"
    exit 1
fi
HEALTH

chmod +x /usr/local/bin/turn-health-check.sh

# Create log rotation
cat > /etc/logrotate.d/turnserver << 'LOGROTATE'
/var/log/turnserver.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 turnserver turnserver
    postrotate
        systemctl reload coturn > /dev/null 2>&1 || true
    endscript
}
LOGROTATE

echo "==================================="
echo "TURN Server Setup Complete!"
echo "==================================="
echo ""
echo "Server IP: $EXTERNAL_IP"
echo "TURN Port: 3478 (UDP/TCP)"
echo "STUN Port: 3478 (UDP)"
echo ""
echo "Credentials stored in: /root/turn-credentials.txt"
echo "Health check: /usr/local/bin/turn-health-check.sh"
echo ""
echo "To view credentials:"
echo "  cat /root/turn-credentials.txt"
echo ""
echo "To check status:"
echo "  systemctl status coturn"
echo ""
echo "To view logs:"
echo "  tail -f /var/log/turnserver.log"
echo ""
echo "⚠️  IMPORTANT: Add these ICE servers to your bootstrap node configuration!"
echo "==================================="
