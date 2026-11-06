# JP Estoque 0.6 — validação integrada bloqueada pelo ambiente

Protótipo local com a identidade visual da JP, materiais e usuários fictícios. Não há autenticação ou banco compartilhado. A seleção de perfil **não é login**; botões e filtros de frontend não protegem dados reais.

```text
code/html/       Página
code/css/        Estilos
code/js/         Consulta, cadastro e importação existentes
code/ts/         Tipos, permissões centrais e administração demonstrativa
img/             Logo
tests/           Regras e integração da interface
docs/            Arquitetura e proposta SQL para futura integração
```

Requer Node.js 22.12+. Execute `npm ci` e `npm run dev`. Abra `/code/html/index.html` na URL exibida. O HTML precisa do servidor para carregar módulos; `file://` não é suportado. Validação: `npm test` e `npm run build`. Para conferir a compilação: `npm run preview`.

| Perfil ativo                                                  | Consulta              | Administração |
| ------------------------------------------------------------- | --------------------- | ------------- |
| Funcionário autorizado, almoxarife, coordenador, planejamento | Contratos autorizados | Não           |
| Diretor                                                       | Todos os contratos    | Não           |
| Proprietário e Administrador                                  | Todos os contratos    | Completa      |
| Qualquer perfil inativo                                       | Nenhum contrato       | Não           |

Selecione Felipe (Proprietário) ou Gabriela (Administrador) no simulador e abra Administração. Ambos podem cadastrar, editar e excluir materiais, gerenciar fornecedores/contratos, cadastrar/editar usuários e seus perfis/vínculos, ativar/desativar usuários, visualizar histórico e editar configurações gerais. A matriz de acesso mostra as mesmas capacidades para os dois perfis.

As abas administrativas usam as permissões centralizadas em `code/ts/access.ts`. Usuários têm ID, nome, email fictício, perfil, status e lista de contratos autorizados. Não é permitido desativar/rebaixar o último Proprietário ou Administrador ativo. Contratos e fornecedores vinculados não podem ser excluídos sem remover os vínculos.

Consulta, busca, filtros, detalhes, fornecedores, exportação CSV, restauração e importação Excel/CSV com mapeamento/prévia foram preservados. Importações aceitam somente contratos cadastrados. Renomeações de fornecedores/contratos atualizam os materiais associados; restauração utiliza os contratos ainda existentes e os nomes atuais. OC/NF continuam apenas como referências; nenhum processo de RM, OC, compras ou recebimento foi modificado.

Materiais fictícios ficam em `jp_estoque_demo_v02`, com recuperação de dados válidos da v0.1. Usuários, vínculos, fornecedores, contratos, histórico e configurações de teste ficam em `jp_estoque_admin_demo_v02`. Esses dados não são seguros ou compartilhados. O histórico é demonstrativo e adulterável. A escolha do seletor não é persistida; nenhum token/sessão é criado. Não inserir dados reais. Para retornar às fixtures iniciais, remova ambas as chaves de teste e recarregue (remova também as chaves v0.1 se não quiser a recuperação antiga).

A [arquitetura futura](docs/arquitetura.md) define adaptadores para Supabase Auth e autorização real com RLS. O SQL é uma proposta não aplicada; a integração e a validação do banco ficam para a próxima etapa.

## Importação v0.3

Excel/CSV agora oferece seleção de aba e linha de cabeçalho, mapeamento de colunas, validação de códigos/descrições/unidades/quantidades/contratos, duplicidades, prévia paginada, ações por linha e relatório persistido com data e arquivo de origem. Todas as linhas começam ignoradas; adicionar ou atualizar exige escolha e confirmação. Proprietário e Administrador ativos possuem a capacidade central `import_spreadsheets`.

O cadastro global de produto está separado dos saldos por contrato nos tipos e no snapshot local, com uma projeção de compatibilidade para as telas antigas. Atualizar o produto afeta seus dados globais, mas só o saldo do contrato escolhido é substituído; quantidades não são somadas. Não há movimentações de estoque.

SheetJS CE 0.20.3 está instalado pelo pacote oficial e sua licença Apache-2.0 é distribuída em `public/licenses/`. Os arquivos são lidos localmente; não há upload ou scripts de CDN em tempo de uso. Planilhas Excel/CSV são ignoradas pelo Git. Os testes usam apenas arquivos fictícios gerados em memória.

Fluxo, regras, limites, licença e arquitetura estão em [docs/importacao-v03.md](docs/importacao-v03.md).

## Correção da inicialização no navegador

Bases válidas sem data e usuários com IDs personalizados agora são exibidos sem fallback destrutivo. JSON incompatível ou versões futuras são preservados e sinalizados; não limpe o localStorage. Quando a base de materiais está vazia, selecione Proprietário/Administrador e use **Carregar dados fictícios em base vazia**, com confirmação. A abertura da página não preenche ou grava materiais automaticamente.

Para testes reais: `npx playwright install chromium` e `npm run test:browser`. A suíte executa Chromium contra o Vite e contra o build em perfis isolados. Resultados e evidências: [diagnóstico da inicialização](docs/correcao-inicializacao.md).

## Interface v0.4

Pesquisa em destaque, simulador recolhível com perfil visível no resumo, filtros com limpeza rápida, resultados adaptados a cartões no celular e detalhes com saldos por contrato autorizado. O atalho `/` foca a pesquisa. Diálogos mantêm o foco, fecham com Escape e retornam ao controle anterior. As abas administrativas têm navegação por setas, Home e End.

Dados, chaves e esquema do localStorage não mudaram nesta versão. As permissões aprovadas permanecem; a seleção de perfil continua sendo demonstração, não login. Detalhes, validação e limitações: [interface v0.4](docs/interface-v04.md).

## Infraestrutura v0.5 — online desativado

O terminal continua local. A fábrica em `code/ts/data/backend.ts` retorna os adaptadores anteriores sem I/O; `online` é rejeitado nesta versão. Não há SDK/conexão Supabase ou migração do localStorage. A importação Excel e as permissões locais não foram modificadas.

Quatro migrações em `supabase/migrations/` preparam catálogo global, saldos/localizações por contrato, usuários/vínculos, fornecedores, referências OC/NF e histórico. As regras RLS são testadas em PostgreSQL 17.11 nativo por `npm run test:db`, com fixtures Auth exclusivamente locais e sem Docker. Isso valida SQL/RLS de verdade, mas não valida JWT, GoTrue ou PostgREST.

- [Arquitetura e modelo v0.5](docs/arquitetura-v05.md)
- [Permissões RLS e matriz de segurança](docs/permissoes-rls.md)
- [Configuração futura do Supabase](docs/configuracao-supabase.md)
- [Relatório de validação e pendências](docs/relatorio-v05.md)

`npm run test:all` executa os testes existentes, TypeScript, PostgreSQL nativo e Playwright/build. Não cria projeto remoto, conta Auth real ou serviço pago. Não aplicar o antigo `docs/supabase-proposta.sql` junto às migrações v0.5. Não aplicar o stub `db-tests/support/auth.sql` a um projeto Supabase.

## Estado da integração v0.6

A CLI Supabase 3.0.0 está fixada como ferramenta de desenvolvimento. Este Windows não possui Docker/Podman ou WSL instalado; o runtime nativo completo Supabase não suporta Windows. Não foi possível iniciar GoTrue/PostgREST nem executar os cenários com JWTs reais. A aplicação permanece em demonstração; autenticação online **não está pronta**.

`npm run test:integration` executa um preflight local não destrutivo, em cópia isolada da configuração/migrações, e gera `test-results/integration-results.json`. Os 18 cenários obrigatórios permanecem bloqueados, com zero testes Auth executados. O comando retorna código 2; presença da CLI ou do engine não é considerada aprovação da integração. A suíte HTTP real não foi implementada/executada neste ambiente indisponível.

`npm run verify:v06` executa a regressão local e depois a etapa integrada: deve terminar bloqueado enquanto essa etapa estiver pendente. `test:all` continua sendo a suíte local/nativa; não é uma aprovação de Supabase Auth.

Evidências, plano de retomada e diferenças entre testes executados e bloqueados: [relatório v0.6](docs/integracao-v06.md).
