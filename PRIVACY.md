# Política de Privacidade — Focus Guard

**Última atualização:** 12 de março de 2026

## Resumo

O Focus Guard **não coleta, transmite ou compartilha** nenhum dado pessoal. Todos os dados ficam armazenados localmente no seu navegador.

## Dados armazenados localmente

A extensão armazena os seguintes dados usando `chrome.storage.local` (apenas no seu dispositivo):

- Lista de sites configurados pelo usuário e seus limites de tempo
- Tempo de uso diário em cada site configurado
- Histórico de uso dos últimos 30 dias
- Configurações de preferência (Pomodoro, respiração, desafios, horários)
- Dados de streaks (dias consecutivos dentro dos limites)

## Dados que NÃO coletamos

- Nenhum dado de navegação em sites não configurados pelo usuário
- Nenhuma informação pessoal (nome, email, localização)
- Nenhum dado é enviado para servidores externos
- Nenhum dado é compartilhado com terceiros
- Nenhum cookie de rastreamento é utilizado
- Nenhuma análise ou telemetria é realizada

## Permissões

- **storage**: salvar configurações e histórico localmente
- **tabs**: detectar a aba ativa para contagem de tempo
- **alarms**: reset diário automático e atualização do badge
- **webNavigation**: detectar mudanças de página para contagem precisa
- **notifications**: alertar quando o limite está próximo
- **host_permissions (all_urls)**: necessário para redirecionar qualquer site configurado para a página de bloqueio

## Contato

Para dúvidas sobre privacidade, abra uma issue no repositório: https://github.com/GabrielBBaldez/focus-guard/issues
