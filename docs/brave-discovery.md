# Brave News Search — Fase 2

## Implementação

O serviço fica em `services/discovery/`. Ele chama o endpoint dedicado `GET https://api.search.brave.com/res/v1/news/search`, usa o header secreto `X-Subscription-Token`, pagina até 10 páginas (`count` limitado a 50, `offset` até 9), e usa `freshness=pd` por padrão ou intervalo `YYYY-MM-DDtoYYYY-MM-DD`. Consultas e categorias editáveis ficam em `config/discoveryQueries.js`.

A normalização guarda os campos originais em `news_v2` e registra cada observação canônica em `news_discovery_records`; execuções e resultados ficam em `news_discovery_logs`. URL canônica remove parâmetros de rastreamento conhecidos, fragmentos e diferenças comuns de host/protocolo. Similaridade de título só marca `possible_duplicate`: esse artigo permanece salvo e pode ser revisado, não é descartado. Duplicata exata reutiliza a notícia existente sem sobrescrever conteúdo ou dados editoriais.

Artigos efetivamente novos recebem uma identidade de origem própria em `news_sources`: uma entrada `brave://<host>` inativa por domínio, mesmo quando existe um feed RSS ativo do mesmo publisher. Essa identidade não é consumida pelo coletor RSS e mantém a origem Brave caso o metadata do artigo seja reconstruído. `metadata.provider = "brave"` e `news_discovery_records` também registram a descoberta. Notícias RSS observadas como duplicatas exatas pela Brave continuam sendo RSS e não são bloqueadas. Se uma notícia Brave histórica sem identidade própria voltar a ser descoberta, apenas seu `source_id` é corrigido; o conteúdo original não é sobrescrito. Não é feita uma varredura em massa dos dados antigos.

O seletor e o sender legados excluem todos os artigos com esse marcador. A descoberta não os envia nem permite que `/trigger-email`, o cron ou a mensagem de boas-vindas os incluam. A futura entrega editorial precisa usar seu próprio fluxo aprovado; ela não foi conectada ao envio legado nesta fase.

O serviço continua separado do agendador RSS e do envio atual. Ainda não há rota HTTP para esta fase. Para persistir, as tabelas da Fase 1 precisam ter sido migradas antes; este passo não executa migrações.

## API e limitações

A Brave documenta `q`, `search_lang`, `country`, `safesearch`, `count`, `offset` e `freshness`. `page_age` é a melhor data disponível conforme publicação/modificação reportada pela página; `age` é tratado como texto relativo quando necessário. `page_fetched` é mantido como metadado e não é confundido com publicação. Se foi solicitado um intervalo e não há data de publicação interpretável, o resultado é rejeitado para não tratá-lo como recente apenas por ter sido descoberto agora.

O plano Search da Brave atualmente lista resultados de News; a disponibilidade real da chave usada pelo projeto só pode ser confirmada com uma chamada autenticada na conta do titular. HTTP 401/403 é tratado como problema de chave/plano; 429 respeita `Retry-After` e tem retentativas limitadas. Os limites comerciais e a quota dependem da conta e do plano.

Referências oficiais: [News Search e filtros](https://api-dashboard.search.brave.com/app/documentation/news-search/get-started), [parâmetros e resposta](https://api-dashboard.search.brave.com/api-reference/news/news_search/get), [planos e limites](https://api-dashboard.search.brave.com/documentation/pricing).

## Configuração e execução manual

1. Configure `BRAVE_API_KEY` no `.env` do backend; nunca no frontend ou no repositório.
2. Rode `npm run discover:brave` para consultar as categorias e mostrar apenas o resumo, sem gravação no banco.
3. Para testar uma consulta, defina `BRAVE_DISCOVERY_QUERY_ID`, por exemplo `hardware` ou `cybersecurity`.
4. A persistência só é permitida com `npm run discover:brave -- --persist` junto de `ALLOW_EDITORIAL_DISCOVERY_WRITES=1`, `TIDB_URL` correto e migration editorial já aplicada. Não execute isso em produção sem backup e autorização.

`npm run test:brave-discovery` usa fetch mocks e não chama Brave nem TiDB. `npm run test:editorial-db` valida também o contrato dos repositories do schema da Fase 1.
