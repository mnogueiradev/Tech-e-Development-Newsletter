# Entregabilidade de email

A aplicação envia newsletters pelo Resend em HTML e texto simples e inclui os cabeçalhos `List-Unsubscribe` e `List-Unsubscribe-Post` para cancelamento em um clique. Isso facilita a classificação e o cancelamento, mas não garante que o provedor do destinatário coloque a mensagem na caixa de entrada.

## Verificação do domínio

No painel do Resend, confirme que `techndevn.com` está verificado e que todos os registros DNS fornecidos pelo Resend estão publicados no provedor DNS do domínio:

- DKIM do Resend, com status verificado;
- SPF autorizado para o serviço de envio, sem criar um segundo registro SPF no mesmo domínio;
- DMARC publicado e alinhado com o domínio do remetente `newsletter@techndevn.com`.

Use os valores exatos exibidos pelo Resend para a configuração atual do domínio. Não copie registros de exemplo nem substitua registros SPF existentes sem consolidá-los; alterações incorretas podem prejudicar outros serviços de email do domínio.

## Diagnóstico de mensagens no spam

Para uma mensagem marcada como entregue pelo Resend, inspecione os cabeçalhos originais no provedor destinatário e confirme `SPF=pass`, `DKIM=pass` e `DMARC=pass`, além do alinhamento com `techndevn.com`. Se a autenticação passar, verifique a reputação do domínio/IP e a classificação do conteúdo no provedor destinatário. Solicitar ao destinatário que marque a mensagem como “Não é spam” pode ajudar a treinar a caixa postal individual, mas não substitui autenticação válida nem garante a classificação para outros destinatários.
