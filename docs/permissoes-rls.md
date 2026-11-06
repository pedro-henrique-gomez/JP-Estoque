# JP Estoque v0.5 — autorização PostgreSQL/RLS

## Matriz efetiva no banco

| Perfil ativo                                                  | Consulta de contratos/saldos                                            | Administração                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| FUNCIONARIO_AUTORIZADO, ALMOXARIFE, COORDENADOR, PLANEJAMENTO | Somente contratos vinculados                                            | Nenhuma                                                    |
| DIRETOR                                                       | Todos os contratos                                                      | Nenhuma                                                    |
| ADMINISTRADOR, PROPRIETARIO                                   | Todos os contratos                                                      | Cadastros, usuários e vínculos pelas operações autorizadas |
| Sem perfil, sem vínculo no perfil restrito ou inativo         | Sem dados de negócio                                                    | Nenhuma                                                    |
| Não autenticado (`anon`)                                      | Sem privilégios em todas as tabelas da aplicação e RPCs administrativas | Nenhuma                                                    |

Nomes internos do enum são minúsculos, iguais aos tipos locais. Cada usuário pode consultar seu próprio perfil, inclusive para descobrir que está inativo; esta é a única exceção de leitura para inativos. Não inclui dados de contratos ou de outras pessoas.

## Autoridade e negação por padrão

As 12 tabelas públicas têm RLS e FORCE RLS. Grants e políticas são separados: sem grant a operação nem é autorizada; com grant ela ainda precisa satisfazer a política. `anon` não recebe grants. Papéis da aplicação não podem criar objetos em `public`. Objetos futuros do papel de migração começam sem grants para `PUBLIC`, `anon` e `authenticated`; funções também têm o EXECUTE global padrão revogado, além dos defaults por schema.

Helpers `private.is_admin`, `is_active` e `can_read_*` obtêm o ID de `auth.uid()` e consultam o perfil/status/vínculos nas tabelas protegidas. Não leem papel informado pelo frontend, seletor, `user_metadata` ou `app_metadata`. JWT válido fornece identidade; a autorização continua sendo decidida pelos registros atuais do banco.

Os helpers são `SECURITY DEFINER`, pertencem ao papel confiável de migração e têm `search_path=''` com tabelas qualificadas. Isso evita recursão das políticas de perfis e resolução de nomes controlada pelo cliente. Execute é revogado de PUBLIC e concedido somente aos helpers estritamente necessários a `authenticated`. O schema `private` não é exposto pela API; sua tabela mutex não tem grants, e a função interna de administração não pode ser chamada diretamente pelo cliente.

## Tabelas auxiliares, projeções e relacionamentos

- Produtos são globais, mas um leitor restrito só vê aqueles com saldo em contrato autorizado. Um Diretor vê produtos associados a qualquer contrato. Apenas administradores veem cadastros globais ainda sem saldo.
- Fornecedores seguem a mesma regra pelos saldos que os referenciam; não há lista global pública de contatos.
- Localizações e referências OC/NF consultam o contrato da própria linha. FKs compostas impedem ligar uma localização/referência ao contrato errado.
- Vínculos de usuário são visíveis apenas ao próprio usuário ativo ou à administração. Diretor não recebe um diretório de usuários.
- Importações e configurações são administrativas. Um lote pode envolver vários contratos, portanto não é exposto a leitores restritos ou ao Diretor.
- `contract_balances_api` usa privilégios do invocador e a RLS subjacente. A projeção expõe quantidade como texto. Novas views devem repetir essa proteção; não criar views definer ou RPCs de consulta que contornem o escopo.

## Escrita e administração de pessoas

Cadastros de materiais, saldos, contratos, fornecedores, localizações, referências e configurações exigem Administrador ou Proprietário ativo. UPDATE permite apenas as colunas de negócio, não o ID estável. Não há políticas de movimentação ou soma de saldo.

Nem Administrador nem Proprietário têm escrita direta em `profiles`/`user_contracts`. Usam:

- `public.admin_save_profile(target_id, new_name, new_email, new_role, new_active)`: cria/altera o perfil de uma identidade Auth já existente. Não cria conta Auth.
- `public.admin_set_user_contract(target_id, target_contract, authorized)`: inclui/remove um vínculo sem duplicá-lo.

As duas operações rejeitam o próprio usuário como alvo, verificam novamente a autorização no banco e serializam alterações com mutex e locks de linha. Os parâmetros são dados não confiáveis; o papel administrativo nunca vem de um parâmetro. Isso bloqueia autopromoção, reativação própria e manipulação dos próprios vínculos. O primeiro gestor precisa de provisionamento confiável fora do cliente. Usuários não são excluídos fisicamente pela API; são desativados, preservando relações e histórico.

O mutex é obtido antes de reler/lockar o ator. Dois gestores concorrentes tentando desativar um ao outro não podem concluir deixando a base sem gestor ativo. Há ainda guarda explícita do último gestor; a proibição de autoalteração mantém o ator administrativo como gestor remanescente.

## Histórico

Triggers geram `audit_events` com identidade de Auth, papel, relógio do servidor e antes/depois. Não há INSERT, UPDATE, DELETE ou TRUNCATE concedido ao cliente, nem mesmo administrativo. O ator histórico não depende da continuidade de uma conta atual. Timestamps de cadastros são gerados/protegidos pelo servidor.

Metadados de importação aceitam apenas INSERT administrativo; criador deve ser o próprio ator, e uma linha só pode ser anexada ao lote desse ator. Não se pode editar ou apagar os registros pela API. Esse registro não gera alteração de estoque por si só. O audit trigger registra as operações reais de banco; resumos fornecidos pelo cliente não substituem essa auditoria.

## O que foi realmente testado

`npm run test:db` inicia PostgreSQL 17.11 **nativo**, aplica as quatro migrações em uma base nova e executa consultas reais sob `SET LOCAL ROLE authenticated` ou `anon`, sem superusuário/BYPASSRLS nas operações testadas. Não é parser, regex, SQLite ou mock do executor SQL.

O harness usa fixtures locais para `auth.users` e `auth.uid()` em `db-tests/support/auth.sql`; ele não é uma migração e nunca deve ser aplicado a Supabase. Claims/identidades de teste são configurados por uma conexão privilegiada exclusivamente no harness. Em produção isso cabe ao gateway/Auth; clientes não podem escolher o `sub` validado. Defaults permissivos de grants são preparados no harness para verificar que as migrações realmente os removem.

São verificadas permissões positivas e negativas para os sete perfis, perfis inativos, ausência de perfil/vínculo, anônimo, DML, RPCs próprias/alheias, metadados forjados, joins, IDs de contratos proibidos, view invoker, restrições de integridade, auditoria, defaults de objetos futuros e concorrência em duas conexões nativas. O resultado detalhado fica em `test-results/database-results.json`. Testes TypeScript/fábrica são outra camada e não comprovam RLS.

## Pendências antes de online

Não foram executados Supabase completo, GoTrue, PostgREST, assinatura/expiração/renovação de JWT, Auth Admin ou requisições HTTP de usuário real. Repetir a matriz através da API usando JWTs reais num projeto local de Supabase e verificar a versão efetiva de PostgreSQL do ambiente de destino antes de liberar o produto. Service-role/secret keys e o superusuário do banco podem contornar RLS e nunca podem estar no frontend. Revisar desempenho/EXPLAIN com volume e o processo auditado de provisionamento inicial.

Referências: [RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [perfis vinculados a Auth](https://supabase.com/docs/guides/auth/managing-user-data), [privilégios padrão PostgreSQL 17](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).
