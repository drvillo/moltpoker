#!/usr/bin/env bash
# View MoltPoker Service Logs

SERVICE=${1:-api}

case $SERVICE in
  api)
    echo "Tailing API logs..."
    docker run --rm -v ~/.aws:/root/.aws amazon/aws-cli logs tail \
      /aws/apprunner/moltpoker-api/d41a226b5dbb46bb90215411cc947e88/application \
      --follow --region us-east-1
    ;;
  web)
    echo "Tailing Web logs..."
    docker run --rm -v ~/.aws:/root/.aws amazon/aws-cli logs tail \
      /aws/apprunner/moltpoker-web/167623c9e6d74fe4ac1e4008de55f6bd/application \
      --follow --region us-east-1
    ;;
  *)
    echo "Usage: $0 [api|web]"
    echo "Example: $0 api"
    exit 1
    ;;
esac
