# Scheduler de descoberta editorial

O scheduler consulta a Fase 2 uma vez por edição, no horário local configurado menos 24 horas. O padrão é descobrir às 08:00 (America/Sao_Paulo) para uma edição às 08:00 do dia seguinte. O intervalo usa instantes UTC; o fuso horário serve para determinar a data e horário editorial.

## Ativação

1. Configure `BRAVE_API_KEY` e as opções `EDITORIAL_*` no ambiente do servidor. Por padrão, o scheduler fica desativado.
2. Revise `EDITORIAL_PUBLICATION_TIMEZONE`, `EDITORIAL_PUBLICATION_TIME` e `EDITORIAL_DISCOVERY_LEAD_HOURS`.
3. Aplique conscientemente as migrações editoriais com `npm run db:migrate:editorial`. O script aplica as versões 001 e 002; ele não é executado automaticamente pelo servidor.
4. Depois da migration, altere `EDITORIAL_DISCOVERY_ENABLED=true` e reinicie o serviço.

O processo verifica o agendamento a cada minuto e também verifica imediatamente ao iniciar para recuperar uma janela de descoberta ainda aberta. Uma chave única por agenda, data editorial e fuso, mais uma reivindicação atômica com lease, impede execução concorrente entre instâncias. O lease é renovado durante o trabalho; cada transação de artigo também valida o token e mantém a linha da execução bloqueada até commit/rollback, impedindo que um worker antigo grave após a tomada do lock. Um processo que caiu pode ser retomado depois do vencimento da lease.

Falhas podem ser tentadas novamente após `EDITORIAL_DISCOVERY_RETRY_DELAY_MINUTES`, até `EDITORIAL_DISCOVERY_MAX_ATTEMPTS`, enquanto a edição ainda estiver antes do horário de publicação. Se o processo voltar depois do horário de publicação, a janela daquela edição é ignorada; não há coleta atrasada automática. Uma execução manual é protegida pelo mesmo lock persistente, limitada a uma execução bem-sucedida por agenda/data/fuso e usa a janela padrão das últimas 24 horas. A persistência idempotente da Fase 2 evita inserir duas vezes notícias já gravadas. O prazo de execução aborta consultas Brave e não envia nem publica a newsletter.

## Execução manual

`runEditorialDiscoveryNow({ pool, ... })` em `services/discovery/discoveryScheduler.js` reutiliza a Fase 2 e grava notícias/logs. Para uma chamada reproduzível, informe `publishedAfter` e `publishedBefore`. A execução manual usa o mesmo lock persistente da agenda informada, então não concorre com o cron para a mesma edição. O CLI `scripts/discover-brave.js --persist` também usa esse caminho; chamadas diretas a `discoverNews({ persist: true })` sem lease são recusadas. Essa função não envia newsletter.

O status e os contadores de cada execução ficam em `editorial_discovery_runs`; o detalhamento de cada consulta permanece em `news_discovery_logs`.
