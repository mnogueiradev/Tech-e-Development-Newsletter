# Persistência dos dados do painel

Os dados usados por `/admin` ficam no TiDB; publicar commits e reiniciar o PM2 não deveria recriar esse banco. A inicialização da aplicação usa `CREATE TABLE IF NOT EXISTS`, sem apagar feedbacks.

## Proteções no aplicativo

- Em produção, a primeira inicialização salva a fingerprint fora do repositório em `~/.newsletter/tidb-fingerprint`. Atualizações do código não substituem esse arquivo. A validação ocorre antes de conectar ou executar migrações; se `TIDB_URL` passar a apontar para outra identidade de banco, o servidor encerra sem alterar esse banco.
- A fingerprint é um hash do usuário de conexão, host, porta e schema. A senha e parâmetros da URL não entram no hash nem são exibidos. Para calculá-la no servidor, no diretório da aplicação, use `npm run db:fingerprint`. O comando lê `TIDB_URL` do `.env` e imprime somente a fingerprint.
- Para uma troca intencional (por exemplo, após restaurar um backup), confirme primeiro que o banco restaurado contém os dados corretos. Em seguida, defina `TIDB_EXPECTED_FINGERPRINT` no `.env` com a fingerprint da nova URL e reinicie o PM2. Uma fingerprint explícita e correspondente aprova e grava a nova identidade. Em ambientes com diretório home efêmero, configure `TIDB_FINGERPRINT_FILE` para um volume persistente.
- Não calcule/aceite a fingerprint de uma base que está mostrando zero feedbacks até confirmar que ela é a base correta ou recuperar os dados. A fingerprint identifica a base; ela não comprova que os dados dentro dela estão completos.
- O feedback agora bloqueia a exclusão de notícias que tenham votos (`ON DELETE RESTRICT`). Se um assinante cancelar, o vínculo com ele é anonimizado (`ON DELETE SET NULL`), mas o voto e as contagens continuam preservados. A migração altera somente as referências e as regras das chaves estrangeiras; não remove votos existentes.

## Recuperar feedback que já não aparece

O servidor deste workspace não conseguiu alcançar o endpoint TiDB configurado, então não foi possível confirmar se os votos ainda existem em outra instância ou restaurá-los daqui. Confira no TiDB Cloud a instância/schema usados antes de a página mostrar zero. Se os dados foram apagados, procure um snapshot ou ponto de recuperação anterior ao desaparecimento e restaure para uma nova instância. Confira os registros restaurados no TiDB antes de apontar a aplicação para ela; depois atualize `TIDB_URL`, calcule a nova fingerprint, defina `TIDB_EXPECTED_FINGERPRINT` no `.env` do servidor e reinicie o PM2. Só então valide `/admin`.

A disponibilidade de snapshot e recuperação pontual depende do plano/configuração da instância. Consulte [Backup & Restore do TiDB Cloud](https://docs.pingcap.com/tidbcloud/backup-and-restore-concepts/) e mantenha backups automáticos habilitados. Faça uma restauração de ensaio periodicamente para confirmar que o backup é utilizável.

## Regras para alterações futuras

- Não use `DROP`, `TRUNCATE` ou exclusões em massa nas tabelas consultadas pelo painel durante deploys ou inicialização.
- Migrações de produção devem ser aditivas, idempotentes e não podem remover linhas de assinantes, feedback, edições ou notícias.
- Antes de uma migração que altere dados, confirme que há um backup recente no TiDB. O código da aplicação não substitui backups do provedor.
