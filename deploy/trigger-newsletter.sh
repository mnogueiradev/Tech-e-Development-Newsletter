#!/usr/bin/env bash
# Dispara o envio manual da newsletter via HTTP.
# Use com OCI Scheduler, crontab do Linux ou GitHub Actions.
#
# Variáveis (exporte antes ou defina no OCI Scheduler):
#   NEWSLETTER_URL  — URL base (default: https://techndevn.com)
#   ADMIN_TOKEN     — token definido no .env da VM
#
# Exemplo crontab (todo dia às 8h, horário de Brasília):
#   0 8 * * * /opt/newsletter/deploy/trigger-newsletter.sh >> /var/log/newsletter/cron.log 2>&1

set -euo pipefail

NEWSLETTER_URL="${NEWSLETTER_URL:-https://techndevn.com}"
ADMIN_TOKEN="${ADMIN_TOKEN:?Defina ADMIN_TOKEN (mesmo valor do .env)}"

TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"
echo "[$TIMESTAMP] Disparando newsletter em ${NEWSLETTER_URL}/trigger-email"

HTTP_CODE=$(curl -s -o /tmp/newsletter-trigger-response.json -w "%{http_code}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  "${NEWSLETTER_URL}/trigger-email")

echo "[$TIMESTAMP] HTTP ${HTTP_CODE}"
cat /tmp/newsletter-trigger-response.json
echo ""

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "[$TIMESTAMP] Newsletter disparada com sucesso."
  exit 0
else
  echo "[$TIMESTAMP] Falha ao disparar newsletter."
  exit 1
fi
