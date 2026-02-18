#!/usr/bin/env bash
# MoltPoker Service Monitoring Script

echo "======================================"
echo "  MoltPoker Service Health Monitor"
echo "======================================"
echo ""

# API Health Check
echo "1. API Server Status:"
echo "   URL: https://ytx3b6eszb.us-east-1.awsapprunner.com"
API_HEALTH=$(curl -s https://ytx3b6eszb.us-east-1.awsapprunner.com/health)
echo "   Health: $API_HEALTH"
echo ""

# Web App Health Check
echo "2. Web App Status:"
echo "   URL: https://qnqtx4m97a.us-east-1.awsapprunner.com"
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://qnqtx4m97a.us-east-1.awsapprunner.com/)
echo "   HTTP Status: $WEB_STATUS"
echo ""

# Database Connection Test
echo "3. Database Status:"
if [ -f "../.env.local" ]; then
  DB_PASSWORD=$(grep SUPABASE_URL ../.env.local | cut -d'/' -f3 | cut -d'@' -f1 | cut -d':' -f2)
  DB_HOST=$(grep SUPABASE_URL ../.env.local | cut -d'/' -f3 | cut -d'@' -f2)
  echo "   Host: $DB_HOST"
  docker run --rm --network host postgres:15-alpine psql \
    "postgresql://postgres:${DB_PASSWORD}@db.${DB_HOST}:5432/postgres" \
    -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null
else
  echo "   [Skipped - .env.local not found]"
fi
echo ""

# AWS Service Status
echo "4. AWS App Runner Services:"
docker run --rm -v ~/.aws:/root/.aws amazon/aws-cli apprunner describe-service \
  --service-arn arn:aws:apprunner:us-east-1:486135724797:service/moltpoker-api/d41a226b5dbb46bb90215411cc947e88 \
  --region us-east-1 \
  --query 'Service.{Service:"API",Status:Status}' \
  --output table

docker run --rm -v ~/.aws:/root/.aws amazon/aws-cli apprunner describe-service \
  --service-arn arn:aws:apprunner:us-east-1:486135724797:service/moltpoker-web/167623c9e6d74fe4ac1e4008de55f6bd \
  --region us-east-1 \
  --query 'Service.{Service:"Web",Status:Status}' \
  --output table

echo ""
echo "======================================"
