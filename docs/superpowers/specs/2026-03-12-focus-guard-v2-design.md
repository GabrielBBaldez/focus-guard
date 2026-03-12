# Focus Guard v2 — Design Spec

**Data:** 2026-03-12
**Objetivo:** Evolucao completa do Focus Guard para publicacao na Chrome Web Store
**Abordagem:** Incremental em 4 fases + revisao de UI/UX

---

## Contexto

Focus Guard e uma extensao Chrome (MV3) para controle de tempo online. Possui tracking de uso, bloqueio por limites diarios/semanais, sistema de desafios, modo nuclear, timer pomodoro, exercicio de respiracao e filtro de YouTube Shorts/comentarios.

**Estado atual:** ~4.440 linhas de codigo, arquitetura limpa (background/popup/blocked), feature set completo mas com bugs pontuais e oportunidades de melhoria em UX e features.

**Meta:** Publicar na Chrome Web Store com qualidade profissional.

---

## Fase 1: Bug Fixes e Estabilidade

### 1.1 Race Condition do Weekly Limit

**Problema:** `getWeeklyUsage()` pode ler dados parciais na virada do dia se `resetIfNewDay()` ainda nao completou o snapshot do dia anterior. O problema real e que `getWeeklyUsage()` le do USAGE ao vivo enquanto `resetIfNewDay()` esta entre dois `await` separados.

**Solucao em duas partes:**

1. **Mutex em `resetIfNewDay()`**: Adicionar um promise lock (`let resetLock = null`) que impede execucoes concorrentes. Toda funcao que chama `resetIfNewDay()` aguarda o lock.

```javascript
let resetLock = null;
async function resetIfNewDay() {
  if (resetLock) return resetLock;
  resetLock = _doReset();
  try { return await resetLock; } finally { resetLock = null; }
}
```

2. **`getWeeklyUsage()` le exclusivamente do historico**: Em vez de somar USAGE ao vivo com historico, `getWeeklyUsage()` le apenas de `focusGuard_history`. O dia atual ja esta no historico porque `saveToHistory()` roda a cada 5 minutos. Para garantir dados frescos, chamar `saveToHistory()` antes de `getWeeklyUsage()` nos pontos criticos (handler de bloqueio).

3. **Reset atomico**: snapshot do dia anterior + zerar USAGE + zerar BYPASSED + zerar EXTRA em um unico `chrome.storage.local.set`.

**Arquivos:** `background.js` — funcoes `resetIfNewDay()`, `getWeeklyUsage()`, `saveToHistory()`

### 1.2 Feedback Claro ao Usuario

**Problema:** Quando bypass falha ou acoes sao bloqueadas, o usuario nao recebe explicacao.

**Solucao:** Adicionar mensagens especificas na blocked page:
- "Limite semanal atingido — bypass nao disponivel esta semana."
- "Modo nuclear ativo ate HH:MM."
- "Voce ja usou todo o tempo extra de hoje (maximo 60 minutos)."
- "Desafio necessario para desbloquear opcoes."

**Implementacao:** O `background.js` retorna um objeto `{ success: false, reason: 'weekly_limit' | 'nuclear' | 'max_extra' }` nos handlers de bypass/extra. O `blocked.js` exibe toast notification com a mensagem correspondente.

**Bug fix adicional — countdown semanal:** Atualmente a blocked page mostra countdown ate meia-noite mesmo para bloqueios semanais. Isso e incorreto porque o limite semanal e uma janela rolante de 7 dias, nao reseta a meia-noite. Correcao:
- Para bloqueios diarios: manter countdown ate meia-noite
- Para bloqueios semanais: remover countdown e mostrar "Uso semanal: Xh / Yh" com contexto do quanto falta para o limite cair (quando o dia mais antigo da janela de 7 dias sair do calculo)
- Informar: "O limite semanal reseta conforme dias antigos saem da janela de 7 dias."

**Arquivos:** `background.js` (handlers), `blocked.js` (toast UI + countdown fix), `blocked.html` (toast container)

### 1.3 Constantes Extraidas

**Problema:** Magic numbers espalhados pelo codigo.

**Solucao:** Criar objeto `DEFAULTS` no topo de cada arquivo:

```javascript
// background.js
const DEFAULTS = {
  POMODORO_FOCUS: 25 * 60,    // 1500s
  POMODORO_BREAK: 5 * 60,     // 300s
  BREATHING_INHALE: 4,
  BREATHING_HOLD: 4,
  BREATHING_EXHALE: 4,
  WARNING_THRESHOLD: 5 * 60,   // 300s (5 min warning)
  MAX_EXTRA_SECONDS: 60 * 60,  // 3600s (60 min max)
  HISTORY_DAYS: 30,
  SNAPSHOT_INTERVAL: 5 * 60 * 1000, // 5 min
  BADGE_UPDATE_INTERVAL: 1000,
};
```

**Fonte unica de verdade:** Criar arquivo `defaults.js` com o objeto DEFAULTS. Importado por `blocked.html` via `<script src="defaults.js">` antes de `blocked.js`, e referenciado em `popup.html` da mesma forma. Para `background.js` (service worker), incluir via `importScripts('defaults.js')` ou duplicar os valores (service workers MV3 nao suportam `<script>` tags). Se duplicado, adicionar comentario "// SYNC WITH defaults.js" para manter rastreavel.

**Arquivos:** `defaults.js` (novo), `background.js`, `blocked.js`, `blocked.html`, `popup.html`, `popup.js`

### 1.4 Acessibilidade Basica

**Problema:** Sem ARIA labels, navegacao por teclado incompleta.

**Solucao:**
- Adicionar `aria-label` em todos os botoes, toggles e inputs
- Adicionar `role="progressbar"` com `aria-valuenow` no pomodoro e barras de progresso
- Adicionar `tabindex` para navegacao logica
- Screen reader text (sr-only) para informacoes visuais (cores de status, graficos)
- Focus visible em todos os interativos

**Arquivos:** `popup.html`, `blocked.html`, `popup.js`, `blocked.js`

### 1.5 Filtro YouTube Mais Robusto

**Problema:** Seletores CSS do YouTube mudam frequentemente.

**Solucao:**

**Estrategia de seletores em camadas:**
- Camada 1 (primaria): seletores atuais baseados em tags customizadas do YouTube (`ytd-rich-shelf-renderer`, `ytd-reel-shelf-renderer`)
- Camada 2 (fallback): seletores baseados em atributos de dados (`[is-shorts]`, `a[href*="/shorts/"]`)
- Camada 3 (heuristica): seletores por texto/aria-label (elementos que contem "Shorts" no texto)

**Mecanismo de fallback:**
- MutationObserver roda apos 3 segundos de pagina carregada
- Se nenhum Shorts foi detectado/escondido pela Camada 1, tenta Camada 2
- Se Camada 2 tambem falha, tenta Camada 3
- Registra no `console.warn` (sempre, nao apenas em dev mode) quais camadas falharam para facilitar manutencao pelo usuario

**Arquivos:** `youtube-filter.js`

### 1.6 Limpeza para Chrome Web Store

- Remover `server.js` do pacote (adicionar ao `.webstoreignore` ou remover do repositorio e manter apenas como ferramenta de dev local)
- Revisar `host_permissions: <all_urls>` — justificar no listing da CWS (necessario para tracking em qualquer dominio)
- Preparar privacy policy (obrigatoria para extensoes com `<all_urls>`)
- Considerar i18n como melhoria futura (atualmente 100% pt-BR)

**Arquivos:** `manifest.json`, `.webstoreignore` (novo), documentacao CWS

---

## Fase 2: Revisao de UI/UX

### 2.1 Popup — Layout e Navegacao

**Cards de sites:**
- Indicadores de status com icones + cores consistentes (icone de cadeado para bloqueado, relogio para ativo, calendario para schedule)
- Barra de progresso com gradiente de cor (verde -> amarelo -> vermelho conforme aproxima do limite)

**Header:**
- Barra de progresso global no topo mostrando tempo total usado vs soma de todos os limites
- Badge de streak ao lado do toggle principal (ex: "5" com icone de fogo)

**Adicionar site:**
- Validacao em tempo real do dominio (feedback visual: borda verde se valido, vermelha se invalido)
- Placeholder mais descritivo

**Transicoes:**
- Slide horizontal suave entre abas em vez de show/hide abrupto
- CSS transitions no container de conteudo
- **Restricao:** popup Chrome tem max-height de 600px. Transicoes devem usar `overflow: hidden` no container e nao alterar a altura durante a animacao para evitar layout shifts

**Arquivos:** `popup.html` (markup + CSS), `popup.js` (logica de transicao e validacao)

### 2.2 Blocked Page — Hierarquia Visual

**Reorganizacao:**
1. Logo + titulo + site name (topo)
2. Stats (usado/limite/total) — destaque visual
3. Mensagem motivacional + quote
4. Desafio (se habilitado) — seção principal
5. Ferramentas (pomodoro + respiracao) — secao secundaria, colapsavel
6. Bypass buttons — final

**Melhorias:**
- Fade-in suave na entrada da pagina (opacity 0->1, translateY 20px->0)
- Barra de progresso no desafio: indicador visual de quantos caracteres foram digitados vs total
- Toast notifications para feedback (sucesso/erro) em vez de comportamento silencioso
- Animacao de "sucesso" quando desafio e completado (confetti sutil ou flash verde)

**Arquivos:** `blocked.html` (markup + CSS), `blocked.js` (toast + progresso)

### 2.3 Consistencia Visual

- **Espacamento:** grid de 4px (4, 8, 12, 16, 24, 32, 48)
- **Border-radius:** 8px cards, 6px inputs, 4px badges, 9999px pills
- **Transicoes:** 150ms ease para hover/focus, 300ms ease para abas/sections
- **Tooltips:** para elementos nao auto-explicativos (icone de schedule, badge de status, icone de streak)
- **Typography:** hierarquia mais clara (h1 > h2 > body > caption com tamanhos e pesos distintos)

**Arquivos:** `popup.html`, `blocked.html` (CSS sections)

### 2.4 Config Tab — Organizacao

**Agrupamento por categorias com headers visuais:**

```
DESAFIOS
├─ Habilitar desafio [toggle]
├─ Dificuldade [easy/medium/hard]
└─ Desafio de entrada [toggle]

TEMPO EXTRA
└─ Minutos por clique [input 1-30]

POMODORO (novo)
├─ Preset [dropdown: Classico/Longo/Curto]
├─ Foco [dropdown: 15/25/30/45/50 min]
└─ Pausa [dropdown: 5/10/15 min]

RESPIRACAO (novo)
└─ Padrao [dropdown: Relaxamento 4-4-4 / Box 4-4-4-4 / Sono 4-7-8]

HORARIOS
└─ [editor de schedule existente]

YOUTUBE
├─ Esconder Shorts [toggle]
└─ Esconder comentarios [toggle]

DADOS (novo)
├─ [Exportar Configuracoes]
└─ [Importar Configuracoes]

ZONA DE PERIGO
└─ [Opcao Nuclear] — visual vermelho destacado
```

**Arquivos:** `popup.html` (markup + CSS), `popup.js` (logica de config)

---

## Fase 3: Customizacao

### 3.1 Pomodoro Customizavel

**Config UI (na aba Config, secao Pomodoro):**
- Dropdown "Foco": 15, 25, 30, 45, 50 minutos
- Dropdown "Pausa": 5, 10, 15 minutos
- Presets rapidos: "Classico (25/5)", "Longo (50/10)", "Curto (15/5)"
- Selecionar preset preenche os dropdowns automaticamente

**Storage:**
```javascript
focusGuard_pomodoroConfig: {
  focus: 1500,  // seconds
  break: 300    // seconds
}
```

**Blocked page:** Le config ao iniciar timer. Se nao existir, usa DEFAULTS.

**Arquivos:** `popup.html` (UI config), `popup.js` (save/load), `blocked.js` (ler config), `background.js` (DEFAULTS)

### 3.2 Respiracao Customizavel

**Config UI (na aba Config, secao Respiracao):**
- Dropdown com presets:
  - "Relaxamento (4-4-4)" — inspira 4s, segura 4s, expira 4s
  - "Box Breathing (4-4-4-4)" — inspira 4s, segura 4s, expira 4s, segura 4s
  - "Sono (4-7-8)" — inspira 4s, segura 7s, expira 8s

**Storage:**
```javascript
// Exemplo: Relaxamento (3 fases)
focusGuard_breathingConfig: {
  name: 'relaxamento',
  phases: [
    { label: 'Inspire', seconds: 4 },
    { label: 'Segure', seconds: 4 },
    { label: 'Expire', seconds: 4 }
  ]
}

// Exemplo: Box Breathing (4 fases)
focusGuard_breathingConfig: {
  name: 'box',
  phases: [
    { label: 'Inspire', seconds: 4 },
    { label: 'Segure', seconds: 4 },
    { label: 'Expire', seconds: 4 },
    { label: 'Segure', seconds: 4 }
  ]
}

// Exemplo: Sono (3 fases, tempos diferentes)
focusGuard_breathingConfig: {
  name: 'sono',
  phases: [
    { label: 'Inspire', seconds: 4 },
    { label: 'Segure', seconds: 7 },
    { label: 'Expire', seconds: 8 }
  ]
}
```

**Blocked page:** Le config e monta fases dinamicamente. Labels e timings vem do config.

**Arquivos:** `popup.html` (UI config), `popup.js` (save/load), `blocked.js` (ler config + renderizar fases)

### 3.3 Export/Import de Configuracoes

**Export:**
- Botao "Exportar Configuracoes" na aba Config
- Gera JSON com: sites, limites semanais, schedules, challenge config, pomodoro config, breathing config, youtube filters, extra time config
- NAO inclui: usage, history, streak, bypass, entry passed (dados transientes)
- NAO inclui nuclear option (estado transiente — se o timestamp ja passou, nao faz sentido restaurar; se ainda esta ativo, e uma decisao que o usuario deve tomar novamente no novo dispositivo)
- Download como `focus-guard-backup-YYYY-MM-DD.json`
- Schema version no JSON para compatibilidade futura

**Import:**
- Botao "Importar Configuracoes" abre file input
- Aceita apenas .json
- Valida schema antes de importar (verifica campos obrigatorios, tipos, ranges)
- Preview: mostra lista do que sera importado (X sites, configs alteradas)
- Confirmacao com 3 opcoes:
  - "Substituir tudo" — apaga configs atuais e aplica as importadas
  - "Mesclar" — adiciona sites novos, atualiza configs existentes, mantem sites que nao estao no backup
  - "Cancelar"
- Na opcao "Substituir tudo", avisar: "Sites e configuracoes atuais serao removidos. Apenas os dados do backup serao mantidos."
- Aplica via `chrome.storage.local.set`

**Schema:**
```javascript
{
  version: 1,
  exportedAt: '2026-03-12T10:30:00Z',
  data: {
    sites: { 'youtube.com': 30 },
    weeklyLimits: { 'youtube.com': 180 },
    schedule: { ... },
    challenge: { enabled: true, difficulty: 'medium' },
    entryChallenge: { enabled: false },
    extraTimeMin: 5,
    pomodoroConfig: { focus: 1500, break: 300 },
    breathingConfig: { ... },
    hideShorts: true,
    hideComments: false
  }
}
```

**Arquivos:** `popup.html` (botoes + modal de preview), `popup.js` (export/import/validacao)

---

## Fase 4: Analytics — Graficos de Tendencia + Streaks

### 4.1 Graficos de Tendencia

**Localizacao:** Aba "Historico" redesenhada com dois graficos no topo.

**Grafico 1 — Barras empilhadas (7 dias):**
- Cada barra = 1 dia
- Segmentos coloridos por site (cores atribuidas automaticamente do palette do tema)
- Eixo Y: minutos
- Eixo X: dias da semana (Seg, Ter, ...)
- Hover: tooltip com breakdown (site: Xmin)
- Renderizacao: SVG puro (sem dependencias)

**Grafico 2 — Linha de tendencia (30 dias):**
- Linha do total diario de uso
- Area preenchida com gradiente (transparente -> cor accent)
- Linha de referencia pontilhada mostrando media do periodo
- Hover: tooltip com total do dia
- Renderizacao: SVG puro

**Dados:** Lidos de `focusGuard_history` (ja existe, guardado 30 dias).

**Paleta de cores por site:**
```javascript
const SITE_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
];
// Atribuidas por hash do nome do site (deterministico, nao muda se site for removido)
// hashIndex = simpleHash(siteName) % SITE_COLORS.length
```

**Arquivos:** `popup.html` (containers SVG + CSS), `popup.js` (renderizacao de graficos + tooltips)

### 4.2 Sistema de Streaks

**Conceito:** Streak = dias consecutivos em que o usuario ficou DENTRO de todos os limites diarios sem usar bypass ou tempo extra.

**Regras:**
- Dia "bom": nenhum site excedeu limite diario E nao usou bypass nem +X min
- Verificacao: no `resetIfNewDay()`, antes de zerar, checar se `usage[pattern] <= limit * 60` para todos os sites E `bypassed` esta vazio E `extra` esta vazio
- Streak incrementa se dia anterior foi "bom"
- Streak reseta a 0 se dia anterior foi "ruim"
- Best streak e persistido para sempre

**Storage:**
```javascript
focusGuard_streak: {
  current: 5,                    // streak atual
  best: 12,                      // melhor de todos os tempos
  lastGoodDay: '2026-03-11'      // ultimo dia "bom" confirmado
}
```

**Exibicao:**
- **Popup header:** badge compacto ao lado do toggle: icone de fogo + numero (ex: "5")
  - Tooltip: "5 dias consecutivos dentro do limite! Recorde: 12 dias"
  - Icone muda de tamanho/intensidade conforme streak cresce (1-3: pequeno, 4-7: medio, 8+: grande com brilho)
- **Aba Historico:** card dedicado no topo com streak atual, melhor streak, e indicador visual
- **Blocked page:** menção sutil: "Voce tem um streak de 5 dias. Nao quebre agora!" (se streak > 0)

**Inicializacao (fresh install):**
- Se `focusGuard_streak` nao existe, criar com `{ current: 0, best: 0, lastGoodDay: null }`
- Primeiro dia "bom" completado inicia streak em 1

**Logica no resetIfNewDay():**

IMPORTANTE: A avaliacao do streak DEVE acontecer ANTES do reset atomico, usando os dados ainda nao zerados.

```
1. Ler usage atual, bypassed, extra, sites, streak (ANTES de zerar)
2. Para cada site em sites:
   a. Se usage[site] > limit[site] * 60 → dia ruim
   b. Se bypassed[site] existe → dia ruim
   c. Se extra[site] > 0 → dia ruim
3. Se dia bom:
   a. streak.current++
   b. Se current > best → best = current
   c. streak.lastGoodDay = ontem
4. Se dia ruim:
   a. streak.current = 0
5. Salvar streak no mesmo `chrome.storage.local.set` atomico do reset
6. Reset atomico: { history atualizado, usage zerado, bypassed zerado, extra zerado, streak atualizado }
```

**Arquivos:** `background.js` (logica de calculo), `popup.html` (badge + card), `popup.js` (renderizacao), `blocked.js` (mensagem motivacional)

### 4.3 Indicadores Visuais de Progresso

- **Cores nos graficos:** verde (<=50% do limite), amarelo (50-80%), vermelho (>80%)
- **Trend arrow melhorado:** compara media da semana atual vs semana anterior com porcentagem (ex: "-15% esta semana")
- **Streak visual:** icone de fogo com animacao CSS (chama que cresce com o streak)

**Arquivos:** `popup.html` (CSS animacoes), `popup.js` (calculos de trend)

---

## Arquivos Impactados (Resumo)

| Arquivo | Fases | Mudancas Principais |
|---------|-------|---------------------|
| `background.js` | 1, 3, 4 | Bug fixes, DEFAULTS, config read, streak logic |
| `popup.html` | 1, 2, 3, 4 | UI reorganizacao, config sections, graficos, streak badge |
| `popup.js` | 1, 2, 3, 4 | Transicoes, validacao, export/import, graficos SVG, streak render |
| `blocked.html` | 1, 2 | Toast container, fade-in, progress bar, reorganizacao |
| `blocked.js` | 1, 2, 3 | Feedback msgs, toast UI, config read pomodoro/breathing, challenge progress |
| `youtube-filter.js` | 1 | Seletores fallback, observer robusto |

---

## Decisoes de Design

1. **SVG puro para graficos** — sem dependencias externas, mantendo extensao leve
2. **Presets em vez de inputs livres** — evita configuracoes invalidas no pomodoro/respiracao
3. **Streak exige "dia limpo"** — sem bypass/extra para contar, incentiva uso genuino dos limites
4. **Export nao inclui dados transientes** — apenas configuracao, facilitando setup em novo dispositivo
5. **Toast notifications** — feedback nao-intrusivo, desaparece apos 3s
6. **Incremental por fases** — cada fase entrega valor independente
