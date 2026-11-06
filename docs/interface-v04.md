# JP Estoque v0.4 — refinamento da interface

## O que mudou

A identidade visual permanece preta, branca e cinza, com a logo original. A consulta prioriza busca por código, descrição, fabricante e referências existentes, seguida de filtros, estado da base, indicadores e resultados. Uma ação limpa pesquisa e filtros e retorna o foco à busca. Mensagens distinguem base vazia, perfil sem materiais autorizados e pesquisa sem resultados.

O simulador é um `<details>` fechado inicialmente, com indicação do perfil atual e a mensagem “Não é login”. Abrir, selecionar e recolher preserva a consulta e não grava a seleção no localStorage. Sua matriz e todas as opções permanecem disponíveis.

Resultados exibem descrição, categoria/fabricante, código, contrato, saldo/unidade e localização. A apresentação vira cartões em telas pequenas, mantendo os mesmos registros e botões. Tabelas administrativas/importação/matriz mantêm rolagem local quando precisam de mais largura, sem expandir a página.

Detalhes do material mostram código, descrição, categoria, fabricante, unidade, modelo e última atualização disponível na base. Os saldos são agrupados por contrato, incluindo localização, fornecedor e referências OC/NF existentes. Só aparecem contratos autorizados para o perfil selecionado. A data é a disponível no snapshot; não se inventam datas individuais por material ou contrato.

## Acessibilidade e teclado

- Link “Ir para a pesquisa” no início e rótulos associados aos campos de busca, filtros e edição de material.
- Indicadores de foco visíveis; botões de toque com altura mínima de 44px nas telas menores.
- Atalho `/` para focar a pesquisa fora de campos editáveis. Não interfere na digitação nem em diálogos abertos.
- Diálogo com nome acessível, foco inicial no botão Fechar, contenção de Tab/Shift+Tab, fechamento com Escape e retorno ao controle anterior. A rolagem do fundo é bloqueada enquanto estiver aberto.
- Abas com `tablist`, `tab`, `tabpanel`, seleção ARIA e navegação por setas, Home e End. A capacidade de acesso continua sendo decidida pelo módulo de permissões existente.
- Contagem de resultados e mensagens de estado atualizadas na interface. Sem animações obrigatórias, com respeito à preferência de movimento reduzido.

## Preservação de dados e escopo

Nenhuma chave ou estrutura de armazenamento foi migrada. O snapshot continua na versão de dados 3, embora a aplicação agora seja 0.4. Não houve limpeza, carga fictícia automática ou substituição de registros. As verificações de preservação de bytes do localStorage continuam na suíte.

Não houve alteração no mapa de perfis/permissões, em RM, OC, compras, recebimento, importação ou integrações. O sistema permanece local com usuários fictícios e não implementa autenticação real ou Supabase. As mudanças de JavaScript são de apresentação e interação; os detalhes usam o mesmo filtro de acesso existente.

## Arquivos modificados

| Arquivo                             | Motivo                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `code/html/index.html`              | Hierarquia da pesquisa, simulador recolhível, rótulos, navegação e diálogo         |
| `code/css/styles.css`               | Refinamento monocromático, responsividade, foco e cartões                          |
| `code/js/script.js`                 | Apresentação dos resultados/detalhes, limpeza de filtros e integração da navegação |
| `code/ts/interface.ts`              | Comportamentos de teclado, foco e semântica das abas                               |
| `code/ts/demo-access.ts`            | Perfil exibido no resumo do simulador                                              |
| `e2e/app.spec.js`                   | Cenários existentes adaptados à abertura explícita do simulador                    |
| `e2e/interface.spec.js`             | Cinco cenários novos de interface e capturas visuais                               |
| `playwright.config.js`              | Desktop e emulação de celular, tanto no Vite como no build                         |
| `package.json`, `package-lock.json` | Versão 0.4.0                                                                       |
| `README.md`, este documento         | Uso, validação e limites                                                           |

## Validação

`npm test`: 65 testes aprovados, preservando a suíte anterior. `npm run typecheck` e `npm run build`: sem erros.

Playwright executa 18 cenários em quatro projetos, totalizando 72 testes aprovados: Chromium desktop/Vite, desktop/build, celular/Vite e celular/build. O celular é emulado a 390 × 844, com toque habilitado. A configuração desktop padrão usa 1280 × 720. Cada teste verifica que não houve exceção de página ou mensagem de console do tipo erro.

Os cinco cenários novos cobrem destaque da pesquisa e ausência de transbordamento; abertura do simulador por teclado e manutenção da seleção; atalho e limpeza de filtros; diálogo, contratos autorizados, Escape e foco; abas por teclado. Os cenários anteriores continuam verificando dados existentes, compatibilidade, persistência, permissões e administração.

Capturas locais, geradas com materiais fictícios e revisadas visualmente:

- `test-results/v04-chromium-build.png` — desktop.
- `test-results/v04-chromium-mobile-build.png` — celular.
- Também existem versões equivalentes do Vite.

As capturas e `test-results/browser-results.json` são artefatos locais ignorados pelo Git. Não contêm dados corporativos reais. A inspeção visual foi das capturas atuais; não há uma suíte de comparação automática contra imagens de referência aprovadas.

Para repetir: `npm ci`, `npx playwright install chromium`, `npm test`, `npm run typecheck` e `npm run test:browser`.

## Limitações

Não houve teste em aparelhos físicos, Safari, Firefox ou com leitores de tela; a melhoria de acessibilidade não é uma certificação WCAG. Tabelas de administração extensas ainda usam rolagem horizontal local em celular. A atualização exibida é da base local, não de uma consulta em tempo real. O protótipo não oferece segurança real de backend ou sincronização entre computadores.
