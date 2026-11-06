# JP Estoque v0.6 — integração Supabase local validada

## Resultado em 6 de novembro de 2026

O bloqueio anterior por ausência de Docker foi resolvido. Foram implementados e executados **18 cenários reais de Auth/PostgREST, todos aprovados**, em um projeto Supabase local descartável. A rodada final registrou 188 requisições HTTP reais, sem contar operações PostgreSQL de preparação. Isso valida a infraestrutura nesta combinação de versões; **não ativa nem conclui a autenticação online da aplicação**. O terminal continua no modo demonstração, sem SDK online, login real na interface ou conexão remota.

A execução reproduzível é `npm run verify:v06`. A evidência sanitizada está em [integracao-v06-evidencias.json](integracao-v06-evidencias.json). O relatório detalhado de cada execução fica em `test-results/integration-results.json`, ignorado pelo Git. Tokens, senhas e chaves não são gravados nesses relatórios.

## Ambiente e versões efetivamente executadas

| Componente                     | Versão/evidência                                                              |
| ------------------------------ | ----------------------------------------------------------------------------- |
| Host                           | Windows, Docker Desktop 4.98.0, WSL 2, contexto desktop-linux                 |
| Docker Engine                  | 29.9.2, Linux amd64, 16 CPUs, 7,408 GiB / 7.586 MiB totais visíveis ao engine |
| Supabase CLI                   | 3.0.0, fixada no package-lock                                                 |
| PostgreSQL Supabase            | 17.11 Linux, imagem `supabase/postgres:17.11.0.011`                           |
| Supabase Auth / GoTrue         | `supabase/gotrue:v2.197.0`                                                    |
| PostgREST                      | `supabase/postgrest:v16.5`                                                    |
| Gateway Kong                   | `supabase/kong:2.8.1`                                                         |
| PostgreSQL nativo de regressão | 17.11 Windows, harness separado                                               |

`docker version` e `docker info` foram executados. Inicialmente não havia contêineres no engine. O harness verifica engine Linux, mínimo operacional de 4 GiB totais e disponibilidade das portas 56320/56321/56322 antes de iniciar. A memória informada pelo Docker é capacidade total do engine, não medição de RAM livre instantânea; a viabilidade foi confirmada pelo início saudável e execução dos serviços.

## Isolamento e preservação

- Configuração e quatro migrações copiadas para `.integration-local/preflight-<UUID>/`, com `project_id` exclusivo e rede Docker exclusiva. Um lock impede execuções simultâneas do harness neste checkout. Um conflito de porta causa falha, sem parar outros serviços.
- Somente a cópia recebe portas de teste, TTL Auth de 60 segundos e desativação de serviços auxiliares. SMTP, Studio, Storage, Realtime, Edge Functions, Analytics e pooler não são necessários para estes cenários e não são iniciados.
- O executor real da CLI aplica as quatro migrações durante `start`. A tabela `supabase_migrations.schema_migrations` é consultada e comparada com as versões esperadas. Configuração original e SQL original/copiado são conferidos por SHA-256.
- **Não** são aplicados `db-tests/support/auth.sql` nem `docs/supabase-proposta.sql`. O schema `auth` é criado pelo stack verdadeiro.
- Engine é acessado por socket local fixo, com contextos remotos, credenciais Supabase/PostgreSQL herdadas e proxies removidos dos comandos da CLI. API e banco aceitos pelo executor são somente `127.0.0.1:56321` e `127.0.0.1:56322`.
- A CLI publica suas portas Docker em `0.0.0.0`/IPv6 por padrão, mesmo com a opção de binding padrão da rede. Isso não é uma publicação hospedada, mas não deve ser confundido com bind exclusivo em loopback. O harness usa somente loopback e encerra os contêineres ao terminar; não altera firewall nem configurações globais do Docker. Executar em máquina/rede de desenvolvimento confiável.
- Dez identidades fictícias `@example.invalid` são provisionadas pela API Auth Admin local. Perfis e fixtures fictícios são inseridos por conexão PostgreSQL administrativa confiável, somente no banco descartável. As verificações de autorização usam JWTs de usuários, nunca `service_role` como ator de negócio.
- A chave administrativa local permanece somente no processo Node. O stdout de sucesso de `status` e `start`, que pode conter credenciais, não é impresso nem persistido. Diagnósticos são redigidos. O frontend não recebe essas credenciais.
- `stop --workdir <cópia>` encerra somente o projeto criado pelo harness, com backup padrão. Não há `db reset`, `db push`, `link`, limpeza global, remoção de volumes existentes ou comandos contra banco remoto. A rede exclusiva é removida após o encerramento; cópias e backups locais ignorados podem permanecer para diagnóstico.
- localStorage, importador Excel, dados demonstrativos, permissões de interface e processos RM/OC/compras/recebimento permanecem inalterados. O Chromium usa perfis de teste próprios; não acessa o armazenamento do navegador cotidiano do usuário.

## Os 18 cenários HTTP

| Cenário         | Asserções principais                                                                                                | Resultado |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| login-correct   | Password grant GoTrue retorna identidade esperada e tokens                                                          | Aprovado  |
| login-incorrect | Senha incorreta rejeitada                                                                                           | Aprovado  |
| jwt-valid       | JWT emitido pelo Auth permite somente contrato autorizado                                                           | Aprovado  |
| jwt-invalid     | Assinatura adulterada rejeitada; único caso deliberadamente inválido                                                | Aprovado  |
| jwt-expired     | Mesmo JWT inicialmente aceito é rejeitado com 401 e mensagem de expiração após TTL e tolerância                     | Aprovado  |
| refresh         | Refresh grant verdadeiro retorna sessão/tokens utilizáveis no Auth                                                  | Aprovado  |
| logout          | Logout global e tentativa de reutilizar refresh token rejeitada                                                     | Aprovado  |
| inactive        | Login não concede acesso de negócio; tabelas vazias e RPC negada                                                    | Aprovado  |
| no-contract     | Usuário ativo sem vínculo não vê contratos/saldos/produtos/auxiliares                                               | Aprovado  |
| metadata        | user_metadata privilegiada não promove perfil; tentativa de alterar app_metadata/role não eleva identidade          | Aprovado  |
| self-promotion  | PATCH direto e RPC contra o próprio perfil negados, inclusive gestores                                              | Aprovado  |
| cross-contract  | Filtros por contrato B não autorizado retornam vazio; escrita rejeitada                                             | Aprovado  |
| rpc-allowed     | Administrador e proprietário gerenciam outro perfil e seus vínculos                                                 | Aprovado  |
| rpc-denied      | Leitor/diretor não administram; administrador não altera seus próprios vínculos                                     | Aprovado  |
| revocation      | Retirada de vínculo e desativação afetam o mesmo JWT; gestor desativado perde RPC na sessão existente               | Aprovado  |
| api-exposure    | Tabelas, view, embeds, schemas privados e RPCs sem vazamento; OpenAPI expõe somente as duas RPCs públicas esperadas | Aprovado  |
| history         | Histórico visível só a gestores; inserção/alteração/exclusão de auditoria e exclusão de importação negadas          | Aprovado  |
| profile-matrix  | Sete perfis, leituras de contratos/auxiliares e CRUD de produto permitido só aos dois gestores                      | Aprovado  |

A matriz usa contratos A/B, materiais, fornecedores e localizações distintos, referências fictícias NF e histórico de importação fictício. A quantidade fracionária utilizada é `1.250001`. Testes usam REST e RPC reais, incluindo embeds de produto → saldo → localização/fornecedor/referência. São verificadas RLS e FORCE RLS nas 12 tabelas públicas. Leituras filtradas por RLS podem retornar HTTP 200 com lista vazia: o teste exige ausência dos registros proibidos, não necessariamente erro HTTP.

O usuário inativo pode autenticar no GoTrue: `profiles.active` é autorização de negócio, não banimento da conta Auth. O teste exige bloqueio dos dados e RPCs. O perfil protegido no PostgreSQL continua sendo a autoridade; metadata do cliente não concede direitos.

## Falhas encontradas e correções

1. A CLI 3.0.0 rejeita a seção antiga `[inbucket]`. A configuração descartável utiliza `[local_smtp]`; o arquivo original não tinha essa seção e permaneceu intacto.
2. O acesso a schema privado não exposto retorna **406**, rejeição válida do PostgREST. A asserção foi ajustada para reconhecer essa resposta; nenhuma permissão foi ampliada.
3. Uma execução intermediária teve 17/18: o JWT ainda era aceito em `exp + 2s`. O PostgREST concede **30 segundos de tolerância de relógio**. O teste final aguarda `exp + 32s`, preservando assinatura, payload, token e relógio do sistema. Confirma também TTL real de 60 segundos. A espera ocorre em intervalos curtos com progresso visível.
4. Uma rodada exploratória foi interrompida pelo encerramento antecipado do stack enquanto o teste aguardava expiração. Ela não conta como aprovação; o runner final mantém o stack até concluir todos os casos e encerra em `finally`.

**Nenhuma incompatibilidade exigiu alteração das quatro migrações ou enfraquecimento das políticas RLS.** As correções são do harness de integração e sua configuração isolada.

Referências oficiais: [configuração CLI Supabase](https://supabase.com/docs/guides/local-development/cli/config), [tolerância JWT do PostgREST](https://docs.postgrest.org/en/v14/references/auth.html), [sessões Supabase](https://supabase.com/docs/guides/auth/sessions), [logout](https://supabase.com/docs/guides/auth/signout).

## Regressões executadas

| Verificação               | Resultado                                                                        |
| ------------------------- | -------------------------------------------------------------------------------- |
| Vitest                    | 80 aprovados em 9 arquivos; 78 anteriores preservados e dois novos de isolamento |
| PostgreSQL nativo isolado | 446 verificações aprovadas; 0 falhas                                             |
| Chromium real             | 72 testes aprovados, desktop/celular emulado, Vite/build                         |
| TypeScript                | Sem erros                                                                        |
| Build Vite                | Concluído, 24 módulos                                                            |
| Supabase Auth/PostgREST   | 18 cenários executados e aprovados; 0 bloqueados                                 |

A regressão PostgreSQL nativa usa seu próprio fixture Auth e não é contabilizada como autenticação integrada. Os 18 cenários acima usam exclusivamente os serviços reais para autenticação, tokens e autorização HTTP. Avisos `NO_COLOR`/`FORCE_COLOR` no runner Chromium não representam falha.

## Arquivos e reprodução

Arquivos adicionados: `integration-tests/start-local.mjs`, `execute-local.mjs`, `http-cases.mjs`, `safety.mjs`, `tests/integration-safety.test.js` e evidência sanitizada em `docs/`. Alterados: `integration-tests/run.mjs`, redator de diagnósticos e seu teste, README, este relatório e mensagem de rejeição de modo online em `code/ts/data/backend.ts`. Nenhuma dependência nova, alteração de schema ou mudança de comportamento do aplicativo foi necessária.

```sh
npm ci
npm run test:integration
# Regressões completas e integração, em sequência:
npm run verify:v06
```

Requer Docker Linux acessível localmente e portas livres. Primeira execução baixa imagens oficiais. `test:integration` retorna 0 somente se todos os cenários executados passarem e o encerramento funcionar; ausência de runtime retorna bloqueio com código 2, outros erros retornam 1. Se o processo for encerrado externamente, um lock pode permanecer: investigar a execução e o workspace indicados em `.integration-local/current.json` antes de encerrar apenas aquele projeto e remover o lock. Nunca usar limpeza global de contêineres/volumes para resolver isso.

## Limitações e pendências para uma versão online

- Validação local nesta combinação de versões, sem ambiente remoto, produção ou publicação. Não representa auditoria exaustiva, teste de carga nem certificação de segurança.
- Nenhum login/callback/adaptador online foi implementado no terminal. Confirmação de email, recuperação de senha, MFA, SMTP, OAuth, redirecionamentos e entrega de emails não foram testados. As contas de teste são confirmadas pelo mecanismo administrativo local.
- Logout invalida refresh; um access JWT emitido pode continuar aceito até sua expiração mais tolerância. Revogação de vínculo/status de negócio é imediata nas requisições seguintes por RLS, como comprovado com a mesma sessão.
- Primeiro gestor foi provisionado pelo harness confiável. O provisionamento operacional seguro, políticas de senha, implantação, HTTPS, backups/restauração, monitoramento e concorrência via API sob carga precisam de trabalho próprio antes de ativar online. Os testes de concorrência SQL existentes permanecem separados.
- Serviços auxiliares excluídos não são cobertos. Os backups descartáveis ficam apenas no ambiente local ignorado; nenhum usuário, dado ou segredo foi enviado ao GitHub.
- O modelo aprovado continua proibindo autoadministração, inclusive por proprietário/administrador. Alterações administrativas exigem outro gestor autorizado.
