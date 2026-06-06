#!/usr/bin/env bash
# Instala crontab na VM para disparo diário às 8h (America/Sao_Paulo).
# Redundância ao node-cron interno — garante envio mesmo se o cron in-process falhar.
#
# Uso: ADMIN_TOKEN=seu_token ./deploy/install-crontab.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
ADMIN_TOKEN="${ADMIN_TOKEN:?Defina ADMIN_TOKEN}"

CRON_LINE="0 8 * * * NEWSLETTER_URL=https://techndevn.com ADMIN_TOKEN=${ADMIN_TOKEN} ${APP_DIR}/deploy/trigger-newsletter.sh >> /var/log/newsletter/cron.log 2>&1"

mkdir -p /var/log/newsletter 2>/dev/null || sudo mkdir -p /var/log/newsletter

# Evita duplicata
(crontab -l 2>/dev/null | grep -v "trigger-newsletter.sh"; echo "$CRON_LINE") | crontab -

echo "Crontab instalado:"
crontab -l | grep trigger-newsletter
