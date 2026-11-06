# JP Estoque v0.5 — relatório de infraestrutura e segurança

## Resultado e escopo

Infraestrutura futura preparada e testada no nível PostgreSQL. A aplicação continua integralmente local, sem Supabase conectado. Nenhum projeto remoto, conta Auth real, segredo operacional ou serviço pago foi criado/ativado. Não houve limpeza ou migração do localStorage, alteração da importação Excel ou dos processos de RM, OC, compras e recebimento.

A entrega não representa um sistema online pronto para produção. Os bloqueios e testes pendentes da seção final devem ser concluídos em versão posterior antes de ativar online.

## Validação realmente executada

Comando final: `npm run test:all`.

| Camada                                 | Resultado                                 | Evidência                                                                           |
| -------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Testes existentes e novos da aplicação | 68 aprovados, 7 arquivos                  | Vitest; 65 anteriores preservados e 3 novos da seleção de infraestrutura            |
| TypeScript                             | Sem erros                                 | `tsc --noEmit`                                                                      |
| Migrações e autorização SQL            | 446 verificações aprovadas, nenhuma falha | Quatro migrações aplicadas e consultas reais em PostgreSQL 17.11 nativo Windows x64 |
| Build                                  | Concluído, 24 módulos                     | Vite 7.3.7; ferramentas PostgreSQL não entram no bundle web                         |
| Navegador                              | 72 testes aprovados                       | Chromium, desktop/celular emulado, Vite/build; suíte anterior preservada            |

Os 446 itens são grupos de verificações SQL executadas, alguns com mais de uma asserção; não são 446 testes estáticos ou uma contagem de linhas SQL. Relatório detalhado local em `test-results/database-results.json`, com versão do motor, nome e resultado de cada verificação. Playwright grava seu relatório em `test-results/browser-results.json` e seus artefatos em `test-results/playwright/`, sem apagar o relatório do banco. Esses arquivos são ignorados pelo Git.

Motor verificado: `PostgreSQL 17.11 on x86_64-windows, compiled by msvc-19.44.35228, 64-bit`. O runner inicia um cluster novo em loopback, aplica cada migração em transação e encerra o processo no final. Não usou Docker, SQLite, parser SQL, PGlite ou mock do executor PostgreSQL.

As consultas de aplicação foram executadas como `authenticated`/`anon`. Uma asserção verifica efetivamente `current_user`, `rolsuper=false` e `rolbypassrls=false`. A conexão privilegiada é usada apenas para preparar fixtures/observar os testes; a leitura/escrita da matriz passa pelas regras reais de grants e RLS.

## Cobertura SQL

- Leitura permitida/negada para os sete perfis ativos e todos os perfis inativos, usuário sem contrato, identidade sem perfil e não autenticado.
- INSERT/UPDATE/DELETE dos cadastros de negócio por perfil; perfis e vínculos sem escrita direta, inclusive para administradores.
- RPCs administrativas para outras identidades, negação de autoalteração, autopromoção, reativação própria e mudança dos próprios vínculos.
- Criação de perfil apenas para identidade Auth já existente; nenhum procedimento cria uma conta Auth.
- Revogação de status/vínculo aplicada na próxima instrução SQL, sem depender de perfil embutido em claims antigos.
- Dados de produtos, fornecedores, localizações, referências e joins sem exposição de contratos não autorizados.
- View de saldos com invoker security e quantidade textual; mesma matriz de acesso e bloqueio anônimo.
- IDs estáveis, FKs, localização/referência no contrato correto, códigos/contratos/saldos únicos, quantidades fracionárias exatas e negação de valores negativos/NaN.
- Auditoria com ator/contexto do banco, relógio do servidor, antes/depois reais e negação de INSERT/UPDATE/DELETE/TRUNCATE pelo cliente.
- Importações append-only, criador não falsificável e resultados anexados somente ao lote do ator administrativo.
- Defaults permissivos preparados pelo harness e removidos pelas migrações; novos objetos sem acesso implícito pela API.
- Concorrência real em duas conexões: um gestor segura o lock, o segundo é observado esperando em `pg_stat_activity`, e a desativação concorrente não deixa a base sem gestor ativo.

Durante a preparação, o teste de um objeto futuro detectou que revogar EXECUTE apenas por schema deixava o grant global padrão de PUBLIC. A migração foi corrigida com revogação global e por schema; o caso passou depois. Os testes finais foram executados novamente com os defaults permissivos simulados.

## Separação do que foi simulado

O motor SQL, grants, RLS, locks, transações e restrições foram reais. Já `auth.users` e `auth.uid()` são fixtures exclusivamente locais em `db-tests/support/auth.sql`, fora da pasta de migrações. O harness simula a identidade que um gateway confiável fornece, mas não valida assinatura de JWT nem autentica usuários reais. Esse arquivo não pode ser aplicado a Supabase.

Os três testes novos da aplicação verificam que a fábrica mantém os mesmos adaptadores locais, não faz rede/I/O na criação e rejeita online/modos desconhecidos. TypeScript verifica contratos e tipos; não é usado como prova da segurança SQL. Nenhum `supabase test db`/pgTAP ou teste HTTP de PostgREST foi apresentado como executado.

## Arquivos e preservação

- `code/ts/data/config.ts`, `backend.ts`, `contracts.ts`: escolha local fixa, fábrica bloqueada para online e portas futuras.
- `code/js/script.js`: passa a obter os mesmos adaptadores locais pela fábrica. `code/html/index.html`: somente rótulo de versão 0.5.
- `supabase/migrations/20261105000100_model.sql` até `20261105000400_read_projection.sql`: schema, RLS, administração/auditoria e projeção decimal.
- `supabase/config.toml`: configuração futura local, sem seed automático e signup público desativado.
- `db-tests/run.mjs`, `db-tests/support/auth.sql`, `tests/backend.test.js`: testes nativos e da seleção de backend.
- `playwright.config.js`: separa diretório de artefatos para preservar os relatórios SQL.
- `package.json`, `package-lock.json`: versão 0.5.0 e ferramentas de teste fixadas; `.gitignore`: clusters/estado temporário ignorados; `.env.example`: apenas placeholders vazios, não lidos pelo runtime.
- Documentos exigidos: `arquitetura-v05.md`, `permissoes-rls.md`, `configuracao-supabase.md`; README e documentação histórica apontam para as migrações atuais.

O mapa de permissões local, adaptadores de armazenamento, tipos de importação, leitor Excel e serviço de importação não foram modificados. Os testes de preservação de bytes do localStorage e de comportamento do terminal continuam aprovados. Não há dados corporativos, planilhas ou credenciais de conexão no commit.

## Pendências que impedem ativação online

1. Aplicar/revalidar as migrações no stack Supabase real/local com a CLI e versão de destino; o arquivo config foi preparado, mas a CLI/GoTrue/PostgREST não foram executados nesta máquina.
2. Repetir a matriz por HTTP com JWTs reais: assinatura, expiração, renovação, logout, usuário inativo e alteração de metadata. A autorização SQL foi validada; a fronteira de autenticação ainda não.
3. Implementar adaptadores online, callback/sessão, provisionamento confiável inicial e operação Auth Admin no servidor, sem segredos no frontend.
4. Validar planos/índices com volume, restauração de backup, tratamento de limites/erros e precisão/escala dos decimais pela API.
5. Revisão final de segurança do ambiente de destino antes de qualquer liberação. Service-role e superusuário são confiáveis e podem contornar RLS; não são credenciais do cliente.

As políticas não estão pendentes de execução SQL: foram testadas nativamente. As pendências acima são da integração e do ambiente online. O modo online permanece tecnicamente bloqueado e não é anunciado como pronto.
