# Focus Guard v3 - Polish & Features Design

**Data:** 2026-03-17
**Versao alvo:** 3.0
**Escopo:** Polimento de UX + novas features de alto impacto

---

## Resumo

Evolucao do Focus Guard com foco em duas frentes:
1. **Polish**: Tema claro/escuro, animacoes, notificacoes inteligentes, onboarding
2. **Features**: Modo Foco rapido, pausar sem desativar, conquistas, metas semanais, historico expandido

Publico: generalista (estudantes, profissionais, usuarios casuais).
Principio: manter a simplicidade, polir o existente, adicionar valor sem complexidade desnecessaria.

---

## 1. Tema Claro/Escuro

### Comportamento
- Toggle no Settings: Escuro (padrao) | Claro | Sistema
- "Sistema" segue `prefers-color-scheme` do OS
- Aplica-se em popup.html e blocked.html

### Implementacao
- Todas as cores migradas para CSS custom properties (`--bg-primary`, `--text-primary`, `--accent`, etc.)
- Classe no `<html>`: `.theme-dark` ou `.theme-light`
- Storage: `focusGuard_theme` (`"dark"` | `"light"` | `"system"`)

### Paleta Tema Claro
- Background: `#f4f4f5` (zinc-100)
- Cards: `#ffffff`
- Text: `#18181b` (zinc-900)
- Accent: `#6366f1` (indigo - mantem)
- Danger/Nuclear: `#dc2626` (mantem)

### Notas tecnicas
- `<meta name="color-scheme">` deve ser atualizado via JS ao trocar tema: `document.querySelector('meta[name="color-scheme"]').content = theme`
- `<meta name="darkreader-lock">` deve ser removido no tema claro para nao forcar dark mode externo

### Impacto
- Refatorar CSS existente (~100+ cores hardcoded) para usar variaveis
- JS minimo para atualizar meta tags e classe do html
- youtube-filter.js nao e impactado (nao injeta UI visivel)

---

## 2. Animacoes e Transicoes

### Popup
- Troca de tabs com fade + slide suave (150ms)
- Cards de site com stagger animation (50ms entre cada)
- Barras de progresso com animacao ease-out (400ms)
- Badge de status com pulse sutil
- Botao delete com hover scale + fade to red

### Blocked Page
- Logo com fade-in + float up
- Cards aparecem em sequencia
- Quote motivacional com fade-in suave (CSS only)
- Stats cards com count-up animation (0 → valor real) — excecao JS: requer atualizacao do DOM via JS
- Botao de bypass com hover glow

### Regras
- Respeitar `prefers-reduced-motion` (desabilitar animacoes novas E existentes como `logoFloat`, `gridMove`, `fireGlow`)
- Preferir CSS (transitions/keyframes). JS apenas para count-up de numeros
- Nenhuma animacao maior que 400ms

### Impacto
- Majoritariamente CSS/HTML. JS minimo apenas para count-up nos stats da blocked page.

---

## 3. Notificacoes Inteligentes

### Hoje
- Apenas 1 notificacao fixa aos 5 minutos restantes

### Proposta
- Notificacoes configuraveis por percentual: 50%, 75%, 90%
- Toggle individual para cada threshold no Settings
- Mensagens variadas (3-4 opcoes aleatorias por threshold):
  - 50%: "Voce ja usou metade do tempo em {site}. Ainda tem {X}min."
  - 75%: "Atencao! Restam apenas {X}min para {site}."
  - 90%: "Ultimos minutos! {site} sera bloqueado em {X}min."

### Anti-spam
- Flag `_warned{pct}_{pattern}` por dia (mesmo padrao do `_warned5` atual)

### Storage
- `focusGuard_notifications: { enabled: true, thresholds: { 50: false, 75: true, 90: true } }`
- Cada threshold tem toggle individual (true/false)
- Default: 75% e 90% ativados, 50% desativado

### Impacto
- Mudanca pequena no `addUsage()` do background.js
- Nova secao no Settings do popup

---

## 4. Onboarding (Primeiro Uso)

### Quando ativa
- `focusGuard_sites` esta vazio ou nao existe
- Check preciso: `Object.keys(sites || {}).length === 0` apos storage load completo
- Aguardar inicializacao do background.js antes de checar (usar callback do `chrome.storage.local.get`)

### Fluxo (3 passos)
1. **"Bem-vindo ao Focus Guard!"** - "Controle seu tempo online com limites diarios"
2. **"Adicione seu primeiro site"** - Input de dominio + limite com sugestoes rapidas clicaveis: `youtube.com`, `twitter.com`, `reddit.com`, `instagram.com`, `tiktok.com`
3. **"Pronto!"** - Resumo + dica sobre Settings

### Comportamento
- Botao "Pular" em todos os passos
- Flag `focusGuard_onboarded: true` impede repeticao
- Animacao slide horizontal entre steps

### Impacto
- Novo overlay HTML/CSS no popup.html
- Check no popup.js no load
- Nenhuma mudanca no core

---

## 5. Modo Foco Rapido (Nuclear Seletivo)

### Problema
- Nuclear bloqueia TODOS os sites, tudo-ou-nada
- Enterrado no Settings, pouco acessivel

### Proposta
- Botao "Modo Foco" no popup (icone de raio/alvo), acima da lista de sites
- Mini-modal ao clicar:
  - Checkboxes com todos os sites rastreados (todos marcados por default)
  - Duracao: 15min, 30min, 1h, 2h, custom (min 5min, max 8h)
  - Botao "Iniciar Foco" (cor indigo)

### Implementacao
- Reutiliza infraestrutura Nuclear
- `focusGuard_nuclear.sites` recebe array de patterns em vez de `'all'`
- `isNuclearBlocked()` ajustado para checar array vs `'all'`

### Diferenciacao Visual
| | Nuclear | Modo Foco |
|--|---------|-----------|
| Sites | Todos | Selecionaveis |
| Tom visual | Vermelho, agressivo | Indigo, calmo |
| Bypass | Impossivel | Impossivel |
| Onde ativa | Settings (enterrado) | Popup (acessivel) |
| Proposito | Emergencia | Uso diario |

### Banner
- "Modo Foco ativo" (indigo) em vez de "Nuclear" (vermelho)
- Blocked page mostra "Modo Foco" com tom mais leve

### Impacto
- Modal novo no popup
- Ajuste pequeno no `isNuclearBlocked()` e `activateNuclear` handler
- Reutiliza ~90% da logica nuclear

---

## 6. Pausar sem Desativar

### Problema
- Para parar o tracking, usuario desativa a extensao inteira, quebrando streak

### Proposta
- Botao "Pausar" no popup header (icone de pause)
- Dropdown com opcoes: 5min, 15min, 30min, 1h

### Durante a pausa
- Tracking para (nao acumula segundos)
- Sites NAO sao bloqueados
- Badge mostra "⏸"
- Banner amarelo no popup: "Pausado - retoma em X:XX"
- **NAO quebra streak**

### Limites
- Maximo 3 pausas por dia (evita abuso)
- Contador em `focusGuard_pauseCount`
- Botao desabilitado apos 3 pausas ate proximo dia

### Storage
- `focusGuard_paused: { until: timestamp }`
- `focusGuard_pauseCount: number` (resetado diariamente)

### Interacao com Nuclear/Modo Foco
- Botao de pausa DESABILITADO e OCULTO enquanto Nuclear ou Modo Foco estiver ativo
- Tooltip ao passar o mouse: "Nao e possivel pausar durante Nuclear/Modo Foco"
- Pausa so funciona em modo normal de tracking

### Implementacao
- `addUsage()` checa `isPaused()` antes de acumular
- Alarm para auto-retomar
- `resetIfNewDay()` deve resetar `focusGuard_pauseCount` para 0 e limpar `focusGuard_paused` se expirado

### Impacto
- Check novo no `addUsage()`
- Botao + dropdown no popup
- Alarm para retomar
- Ajuste no `resetIfNewDay()`

---

## 7. Conquistas/Badges

### Sistema
- 12 conquistas iniciais desbloqueadas por marcos de uso
- Sub-secao dentro de History tab (ou nova aba "Conquistas")

### Storage
- `focusGuard_achievements: { [id]: { unlockedAt: timestamp } }`

### Conquistas

| ID | Nome | Condicao | Icone |
|----|------|----------|-------|
| `first_block` | Primeiro Limite | Ser bloqueado pela primeira vez | 🛡️ |
| `first_challenge` | Desafio Aceito | Completar primeiro challenge | ✍️ |
| `first_nuclear` | Botao Vermelho | Ativar nuclear pela primeira vez | ☢️ |
| `streak_3` | Foco Iniciante | Streak de 3 dias | 🔥 |
| `streak_7` | Semana Perfeita | Streak de 7 dias | ⭐ |
| `streak_30` | Mes de Ferro | Streak de 30 dias | 💎 |
| `sites_5` | Guardiao | Rastrear 5 sites simultaneos | 🏰 |
| `focus_10` | Modo Foco x10 | Usar Modo Foco 10 vezes | ⚡ |
| `breathe_5` | Respiracao Zen | Completar 5 exercicios de respiracao | 🧘 |
| `pomodoro_10` | Pomodoro Master | Completar 10 ciclos de pomodoro | 🍅 |
| `no_bypass_7` | Sem Atalhos | 7 dias sem usar bypass/extra time | 💪 |
| `veteran` | Veterano | Usar Focus Guard por 30 dias | 🎖️ |

### Contadores de Tracking (novos storage keys)
- `focusGuard_breathingCount: number` — incrementado quando ciclo completo de respiracao finaliza (blocked.js envia mensagem ao background)
- `focusGuard_pomodoroCount: number` — incrementado quando ciclo de pomodoro completa (blocked.js envia mensagem ao background)
- `focusGuard_focusModeCount: number` — incrementado quando Modo Foco e ativado
- `focusGuard_noBypassDays: number` — dias consecutivos sem usar bypass/extra time (avaliado no `resetIfNewDay()` junto com streak)

### Mecanica
- Background.js checa condicoes em momentos chave (apos block, challenge, reset diario, ativacao de foco)
- Ao desbloquear: notificacao Chrome "Conquista desbloqueada: {nome}!"
- Popup: desbloqueadas em cor, nao-desbloqueadas em cinza com "?" e dica
- Toast/flash animation ao desbloquear

### Impacto
- Novos storage keys (achievements + 4 contadores)
- Checks pontuais no background.js
- Mensagens novas de blocked.js → background.js para breathing/pomodoro completion
- Nova secao UI no popup

---

## 8. Metas Semanais

### Conceito
- Meta = objetivo motivacional (nao bloqueia, so acompanha)
- Diferente do Weekly Limit (que bloqueia)

### Tipos
- **Meta geral**: "Max Xh por semana no total"
- **Meta por site**: "Max Xh de YouTube por semana"

### Storage
- `focusGuard_goals: { general: minutes, sites: { pattern: minutes } }`

### Visualizacao
- Card no topo do popup (aba Sites) com progresso da meta
- Barra de progresso: verde (<70%), amarelo (70-90%), vermelho (>90%)
- Texto: "12h de 20h usadas esta semana"
- Ao cumprir: badge verde com scale+glow animation (CSS only) "Meta cumprida!"
- Historico no History tab: semanas cumpridas vs nao

### Diferenciacao

| | Meta Semanal | Weekly Limit |
|--|-------------|--------------|
| Proposito | Motivacional | Bloqueio |
| Ao atingir | Aviso visual | Site bloqueado |
| Obrigatorio | Nao | Sim |
| Feedback | Positivo (parabens!) | Negativo (bloqueado) |

### Impacto
- Novo storage key
- Reutiliza `getWeeklyUsage()` existente
- UI nova no popup (card + settings)

---

## 9. Historico Expandido (365 dias)

### Hoje
- Maximo 30 dias, dados antigos perdidos

### Proposta
- Retencao expandida para 365 dias
- Nova visualizacao: contribution graph estilo GitHub

### Contribution Graph
- Default: 26 semanas (meio ano) visivel no popup (cabe em 400px com cells de 6px + 1px gap)
- Toggle: "26 semanas" | "Ano completo" (ano completo com scroll horizontal)
- Cor por intensidade: cinza (sem uso) → verde claro → verde escuro → vermelho (estourou limite)
- Hover tooltip posicionado para nao transbordar o popup (tooltip acima/abaixo do cell, nao lateral)
- Toggle entre visoes: "7 dias" | "30 dias" | "Ano"

### Compressao de Storage
```
Dias 1-90:   { "2026-03-17": { "youtube.com": 3600, "reddit.com": 1200 } }  // completo
Dias 91-365: { "2025-12-17": { "_total": 4800 } }                           // so total
```

### Mudancas
- `saveToHistory()`: usar `DEFAULTS.HISTORY_DAYS` em vez do hardcoded `30`
- Atualizar `DEFAULTS.HISTORY_DAYS` para `365` em defaults.js
- Compressao roda dentro de `saveToHistory()` no reset diario: ao salvar, comprimir dias com 91+ dias para `_total`
- Limpar dados > 365 dias
- Storage: ~15KB/ano (negligivel)
- Nota: usuarios existentes nao terao dados retroativos — a janela de 365 dias comeca a partir da atualizacao

### Impacto
- Ajuste no `saveToHistory()` e `snapshotToday()`
- Novo componente visual (contribution graph) no popup

---

## Resumo de Storage Keys Novos

| Key | Tipo | Default |
|-----|------|---------|
| `focusGuard_theme` | string | `"dark"` |
| `focusGuard_notifications` | object | `{ enabled: true, thresholds: { 50: false, 75: true, 90: true } }` |
| `focusGuard_onboarded` | boolean | `false` |
| `focusGuard_paused` | object | `null` |
| `focusGuard_pauseCount` | number | `0` |
| `focusGuard_achievements` | object | `{}` |
| `focusGuard_goals` | object | `null` |
| `focusGuard_breathingCount` | number | `0` |
| `focusGuard_pomodoroCount` | number | `0` |
| `focusGuard_focusModeCount` | number | `0` |
| `focusGuard_noBypassDays` | number | `0` |

## Arquivos Impactados

| Arquivo | Mudancas |
|---------|----------|
| `background.js` | Notificacoes inteligentes, pausa, conquistas checks, historico expandido, modo foco |
| `popup.html` | Tema vars, animacoes, onboarding overlay, modo foco modal, pausa botao, conquistas secao, metas card, contribution graph |
| `popup.js` | Tema toggle, onboarding flow, modo foco logic, pausa logic, conquistas render, metas render, contribution graph render |
| `blocked.html` | Tema vars, animacoes |
| `blocked.js` | Tema apply, animacoes count-up |
| `defaults.js` | Novos defaults para notifications, goals, achievements |
| `manifest.json` | Versao 3.0 |

## Ordem de Implementacao Sugerida

1. Tema claro/escuro (base CSS refactor - tudo depende disso)
2. Animacoes e transicoes (aproveita o CSS refactor)
3. Onboarding (independente)
4. Notificacoes inteligentes (mudanca pequena no core)
5. Pausar sem desativar (mudanca pequena no core)
6. Modo Foco rapido (reutiliza nuclear)
7. Metas semanais (reutiliza weekly usage)
8. Historico expandido + contribution graph (mais visual)
9. Conquistas/badges (depende de tudo estar pronto para tracking)
