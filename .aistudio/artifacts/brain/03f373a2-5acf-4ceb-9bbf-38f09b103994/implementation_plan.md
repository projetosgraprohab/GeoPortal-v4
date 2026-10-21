# Plano de Implementação: Visualização Simples e Expandida dos Cards de Camadas

## 1. Contexto e Requisitos
* O usuário solicitou que, por padrão, cada card de camada no painel lateral venha em uma versão **mais simples e enxuta**, exibindo apenas:
  - Alça de arraste (drag handle para reordenar)
  - Botão de visibilidade (olho / toggle)
  - Marcador de cor da camada
  - Nome da camada (com tag de geometria/quantidade resumida)
  - Botão de expandir/recolher (chevron toggle)
* Ao clicar no botão de expandir, exibe-se a **versão expandida** com todas as ferramentas de GIS avançadas já construídas:
  - Controles de opacidade e simplificação poligonal (*smooth factor*)
  - Barra de ações (Estilo, Zoom na extensão, Tabela de atributos, Filtros de feições, Gerenciador de colunas, Atualização de dados GeoJSON/CSV, Exclusão de camada)
  - Seletor de camada ativa
  - Legenda temática retrátil (quando ativa)

## 2. Decisões Arquiteturais de UX & Web Mapping
1. **Estado de Expansão por Camada (`expandedCards`)**:
   - Um estado no React (`Record<string, boolean>`) onde o padrão é `false` (recolhido/simples).
   - O usuário pode expandir qualquer camada individualmente clicando no botão dedicado com ícone animado (`ChevronDown` / `ChevronRight`).
   - Clicar no botão recolhe suavemente de volta ao modo compacto.
2. **Design do Modo Simples (Clean GIS View)**:
   - Altura reduzida e compacta, facilitando navegar por dezenas de camadas sem rolagem excessiva.
   - Tipografia nítida com truncamento adequado para nomes longos de serviços e arquivos shapefile/GeoJSON.
   - Feedback visual imediato quando a camada estiver visível ou oculta.
3. **Design do Modo Expandido (Advanced GIS Toolbar)**:
   - Transição suave (`transition-all duration-200`).
   - Mantém todos os botões de ação e modais protegidos por senha do gestor (GRAPROHAB).
   - Preserva o controle da legenda temática.

## 3. Arquivos a serem modificados
- `src/components/LayerManager.tsx`:
  - Adicionar controle de estado `expandedCards: Record<string, boolean>`.
  - Reestruturar o renderizador do card de camada em duas seções: cabeçalho compacto simples e bloco recolhível expandido.
  - Testar compilação (`compile_applet`) e linting (`lint_applet`).
