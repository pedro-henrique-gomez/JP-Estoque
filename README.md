# JP Estoque 1.0 — preparação para piloto controlado

**Status: NÃO APROVADO PARA PILOTO.** A preparação técnica e os ensaios locais não substituem os critérios de segurança, infraestrutura e operação da JP. Demonstração permanece padrão; online é exclusivamente Supabase local e desenvolvimento explícito. Nenhuma publicação, banco remoto, conta real ou dado corporativo foi utilizado.

[Relatório v1.0](docs/relatorio-v10.md) · [Matriz de riscos](docs/riscos-v10.md) · [Segurança e desempenho](docs/seguranca-desempenho-v10.md) · [Checklist](docs/checklist-piloto-v10.md) · [Operação](docs/operacao-v10.md) · [Backup/restauração](docs/backup-restauracao-v10.md) · [Decisões da JP](docs/pendencias-jp-v10.md).

`npm run dev` abre a demonstração. `npm run dev:online` cria stack descartável e identidades fictícias, com login real em `http://127.0.0.1:5183/code/html/index.html`. O terminal informa somente o caminho local das credenciais de teste. Docker Linux e portas livres são necessários. Seleção de perfis na demonstração não é autenticação nem proteção de dados reais.

`npm run verify:v10` reúne regressões, ensaios operacionais e auditoria npm. `npm run test:readiness` testa Auth/convite/recovery/TOTP, formatos/volumes de XLSX, bloqueios, XSS e dump/restauração cifrada **em laboratório**, sem SMTP real. `npm run audit:dependencies` gera inventário de licenças e advisories npm; não substitui scan de imagens/binários. `npm run audit:images` analisa as quatro imagens públicas locais; o gate está bloqueado por achados altos/críticos e `verify:v10` não deve ser considerado aprovado. Resultados temporários, backups e planilhas são ignorados pelo Git.

Funcionalidades e importador da v0.9 preservados. A v1.0 neutraliza fórmulas somente no CSV exportado, adiciona headers locais e limita a varredura do Vite; não altera localStorage, importação demonstrativa, cinco migrações, RLS/RPC ou processos de RM/OC/compras/recebimento. Não implementa movimentos de estoque. MFA obrigatório, recuperação pela UI, HTTPS/artefato online, DR completo e decisões corporativas continuam pendentes.

Histórico: [importação online v0.9](docs/importacao-online-v09.md), [validação v0.9](docs/relatorio-v09.md), [administração v0.8](docs/relatorio-v08.md), [consulta/Auth v0.7](docs/relatorio-v07.md).
Depois de interromper o launcher online com Ctrl+C, execute `npm run dev:online:stop` para confirmar a limpeza do stack descartável no Windows. Esse comando preserva backups e recusa encerrar uma execução ainda ativa ou diferente.

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

A [arquitetura futura](docs/arquitetura.md) define adaptadores para Supabase Auth e autorização real com RLS. A proposta histórica foi sucedida pelas migrações versionadas e pelas validações locais das versões v0.5 a v0.9; consulte os relatórios correspondentes.

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

O stack Supabase local descartável foi validado com PostgreSQL 17.11, GoTrue v2.197.0 e PostgREST v16.5: **18 cenários reais Auth/API aprovados**, com JWTs emitidos pelo Auth. As quatro migrações e as políticas RLS foram preservadas. O aplicativo continua em demonstração; a autenticação online da interface permanece desativada.

`npm run test:integration` verifica recursos/portas, inicia uma cópia isolada, executa os cenários HTTP e encerra somente o projeto criado. Requer Docker Linux local, ao menos 4 GiB totais e portas 56320/56321/56322 livres. Credenciais ficam apenas no harness Node; a CLI publica portas locais por padrão em todas as interfaces enquanto os contêineres estiverem ativos. Use ambiente de desenvolvimento confiável.

`npm run verify:v06` executa todas as regressões e a integração. O resultado atual é 80 testes automatizados, 446 verificações PostgreSQL nativas, 72 testes Chromium, TypeScript/build e 18 cenários integrados aprovados. Ausência de runtime permanece bloqueio, nunca aprovação simulada.

Resultados, evidências e limitações: [relatório v0.6](docs/integracao-v06.md). Não há conexão remota, publicação, alteração no localStorage ou no importador Excel.
