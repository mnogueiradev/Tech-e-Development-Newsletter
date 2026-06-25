#!/usr/bin/env bash
# Setup completo na VM Oracle Cloud (Always Free).
# Execute como usuário opc com sudo:
#   chmod +x deploy/setup-oracle.sh && sudo ./deploy/setup-oracle.sh
#
# Pré-requisitos: Node.js 20+, git, nginx (opcional para proxy reverso)

set -euo pipefail

APP_DIR="/opt/newsletter"
LOG_DIR="/var/log/newsletter"
SERVICE_USER="${SUDO_USER:-opc}"

echo "=== Tech & Development Newsletter — Setup Oracle Cloud ==="

# 1. Diretório de logs
sudo mkdir -p "$LOG_DIR"
sudo chown "$SERVICE_USER:$SERVICE_USER" "$LOG_DIR"

# 2. Node.js (se não instalado)
if ! command -v node &>/dev/null; then
  echo "Instalando Node.js 20..."
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
  sudo yum install -y nodejs
fi

# 3. PM2 global
if ! command -v pm2 &>/dev/null; then
  echo "Instalando PM2..."
  sudo npm install -g pm2
fi

# 4. Dependências e build
if [ -f "$APP_DIR/package.json" ]; then
  cd "$APP_DIR"
  npm install --omit=dev
  npm run build
else
  echo "AVISO: $APP_DIR/package.json não encontrado."
  echo "Clone o repositório em $APP_DIR antes de continuar:"
  echo "  sudo mkdir -p $APP_DIR && sudo chown $SERVICE_USER:$SERVICE_USER $APP_DIR"
  echo "  git clone <seu-repo> $APP_DIR"
  exit 1
fi

# 5. .env
if [ ! -f "$APP_DIR/.env" ]; then
  echo "AVISO: Crie $APP_DIR/.env baseado em .env.example antes de iniciar."
fi

# 6. Permissões do script de trigger
chmod +x "$APP_DIR/deploy/trigger-newsletter.sh"

# 7. Iniciar com PM2
cd "$APP_DIR"
pm2 delete newsletter 2>/dev/null || true
pm2 start deploy/ecosystem.config.cjs
pm2 save

# 8. PM2 startup no boot
STARTUP_CMD=$(pm2 startup systemd -u "$SERVICE_USER" --hp "/home/$SERVICE_USER" | tail -1)
if [ -n "$STARTUP_CMD" ]; then
  eval "sudo $STARTUP_CMD"
fi

# 9. Instalar systemd como alternativa (opcional — comentado por padrão)
# sudo cp deploy/newsletter.service /etc/systemd/system/
# sudo sed -i "s/User=opc/User=$SERVICE_USER/" /etc/systemd/system/newsletter.service
# sudo systemctl daemon-reload
# sudo systemctl enable newsletter
# sudo systemctl start newsletter

echo ""
echo "=== Setup concluído ==="
echo "  App:     $APP_DIR"
echo "  Logs:    $LOG_DIR"
echo "  PM2:     pm2 status / pm2 logs newsletter"
echo "  Health:  curl http://localhost:3000/api"
echo ""
echo "Próximos passos:"
echo "  1. Configure $APP_DIR/.env (TIDB_URL, SENDER_API_KEY, BRAVE_API_KEY, ADMIN_TOKEN)"
echo "  2. Abra a porta 3000 (ou configure nginx como proxy para techndevn.com)"
echo "  3. Configure cron externo (deploy/trigger-newsletter.sh) ou confie no node-cron interno"
echo "  4. Teste: ADMIN_TOKEN=xxx ./deploy/trigger-newsletter.sh"
