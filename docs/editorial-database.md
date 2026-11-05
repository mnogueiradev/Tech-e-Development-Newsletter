# Banco do Editorial Studio — Fase 1

## Escopo e preservação

O esquema aditivo está em `migrations/001_editorial_studio.sql`. `news_v2` continua sendo a fonte preservada dos dados originais; `editorial_articles` referencia a notícia original e guarda apenas a versão editorial. A Fase 1 não executa Brave, scheduler, rotas, editor, aprovação ou envio.

As tabelas novas incluem `editorial_articles`, `editorial_editions`, `editorial_edition_articles`, `editorial_article_versions`, `editorial_assets`, `editorial_audit_logs`, `news_discovery_logs`, `news_discovery_records` e `newsletter_send_logs`. `news_v2` continua guardando o conteúdo original; discovery records registram referências de origem/canonical URL sem criar outra cópia do artigo. O log de envios prepara idempotência por edição/destinatário para fase posterior, ainda sem lógica de envio.

## Aplicação manual

Não há migrations versionadas no boot atual. O novo runner é separado e nunca é chamado por `server.js`.

1. Faça snapshot/backup do TiDB e confirme que consegue restaurá-lo.
2. Confirme que o `.env` aponta para a instância e schema corretos e que a fingerprint esperada está configurada.
3. Execute `npm run db:migrate:editorial` apenas no ambiente autorizado. O runner cria `schema_migrations`, grava versão e SHA-256 e recusa reaplicar uma migration cujo conteúdo tenha mudado.
4. Revise as tabelas/constraints no TiDB e mantenha o backup até a aplicação ser validada.

DDL MySQL/TiDB pode fazer commit implícito. Se uma execução falhar no meio, ela não registra a versão; as tabelas usam `CREATE TABLE IF NOT EXISTS`, então corrija a causa e repita. Não edite uma migration já aplicada: crie `002_...sql` para mudanças futuras.

## Rollback

Não existe rollback automático porque remover tabelas pode apagar conteúdo editorial. Antes de qualquer adoção em produção, restaure o snapshot para uma instância separada e valide. Se as tabelas novas ainda estiverem vazias e for necessário reverter, um DBA pode removê-las na ordem inversa das FKs (envios, assets, auditoria, logs de descoberta, versões, vínculos de edição, matérias e edições) e por último `schema_migrations`; isso é destrutivo para os dados editoriais novos e não deve ser feito sem backup/inspeção.

## Testes

`npm run test:editorial-db` usa mocks e o runner nativo `node:test` para validar idempotência, checksum, falha parcial, relacionamentos declarados e chamadas dos repositories. Os testes não conectam ao TiDB e não substituem uma integração em schema descartável TiDB/MySQL antes de produção.
