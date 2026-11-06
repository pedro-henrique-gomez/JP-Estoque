# JP Estoque v0.6 — validação integrada bloqueada

## Resultado

**Autenticação online não está pronta e a validação integrada não foi concluída.** O ambiente disponível não permite executar o stack completo Supabase. Foram concluídas as verificações locais possíveis e a documentação do bloqueio, conforme o escopo alternativo solicitado. A aplicação continua em demonstração, com os mesmos dados, permissões, armazenamento e importação Excel.

Não há implementação de login no terminal, conexão remota, publicação online, conta Auth real criada, segredo enviado ao navegador ou alteração de RM/OC/compras/recebimento. Nenhuma conta fictícia foi criada no Supabase real, porque o serviço Auth não foi iniciado.

## Evidências do ambiente

| Verificação executada                         | Evidência                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Plataforma                                    | Windows x64                                                                              |
| Docker/Podman                                 | Não encontrados no PATH ou nos diretórios comuns; socket local Docker ausente (`ENOENT`) |
| WSL                                           | `wsl --list --quiet` informou que o subsistema não está instalado                        |
| Supabase CLI                                  | 3.0.0, instalada e fixada como dependência de desenvolvimento                            |
| Consulta local da CLI                         | `supabase status` em cópia isolada retornou erro por ausência de Docker/Podman           |
| Runtime nativo Supabase completo              | Windows não suportado, conforme documentação oficial                                     |
| Configuração original                         | Preservada, hash conferido antes/depois                                                  |
| Quatro migrações v0.5                         | Copiadas sem alteração, hashes conferidos antes/depois                                   |
| PostgreSQL/GoTrue/PostgREST do stack Supabase | Não iniciados; versões efetivas não determinadas                                         |

Mensagem efetivamente obtida da CLI:

```text
failed to inspect container health: docker: command not found (podman also not found)
```

Não foram instalados Docker, WSL ou componentes de virtualização, nem alterados serviços/configurações do Windows para contornar o bloqueio. A existência do PostgreSQL nativo utilizado pela v0.5 não resolve a ausência de GoTrue e PostgREST.

Referências oficiais: [CLI Supabase e runtimes locais](https://supabase.com/docs/guides/local-development/cli/getting-started), [suporte de plataformas do runtime nativo](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes).

## O que foi implementado e validado

- CLI 3.0.0 fixada para reprodução; somente comandos de versão/status, não login/link/push/reset.
- `integration-tests/preflight.mjs`: inspeção não destrutiva, endpoint Docker estritamente local, ambiente sem credenciais/contextos remotos herdados, proxies removidos e telemetria da CLI desativada no verificador.
- A configuração e as migrações são copiadas para `.integration-local/preflight-<UUID>/`. Somente o `project_id` da cópia muda. O root do projeto e os dados de instâncias existentes não são alterados.
- O preflight não inicia stack, não aplica migrações, não copia o fixture `db-tests/support/auth.sql` e não consulta bancos existentes. A saída de sucesso de `supabase status`, que poderia conter chaves locais, é descartada. Diagnósticos de erro são redigidos antes de persistir.
- `integration-tests/cases.mjs`: manifesto explícito dos 18 cenários obrigatórios, todos bloqueados. Não é uma suíte de autenticação executada.
- `integration-tests/run.mjs`: produz relatório `blocked`, com `executed: 0`, `passed: 0` e `blocked: 18`; sai com código **2**, confirmado no processo Node. Não retorna sucesso apenas porque o engine/CLI existe.
- Dez testes novos verificam isolamento, preservação dos arquivos, ambiente local, remoção de credenciais, proteção dos diagnósticos e impossibilidade de gerar um relatório falsamente aprovado. Eles usam fixtures de arquivos/CLI e **não** simulam aprovação de Auth/JWT.

A suíte HTTP real não foi implementada como se estivesse validada: falta executá-la num stack descartável com serviços reais. Se o runtime passar a existir, o preflight ainda não transforma esse fato em aprovação; a implementação/execução HTTP continua pendente e será explicitamente reportada.

## Testes executados nesta entrega

Comando: `npm run verify:v06`, que executa regressão local e, em seguida, a etapa integrada.

| Camada                                              | Resultado                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| Testes automatizados da aplicação/fábrica/preflight | 78 aprovados, 8 arquivos; 68 anteriores preservados e 10 novos        |
| PostgreSQL nativo isolado                           | 446 verificações SQL aprovadas em PostgreSQL 17.11                    |
| TypeScript                                          | Sem erros                                                             |
| Build                                               | Concluído, 24 módulos                                                 |
| Navegador                                           | 72 testes Chromium aprovados; desktop e celular emulado, Vite e build |
| Preflight da integração                             | Executado; CLI e preservação verificadas; runtime indisponível        |
| Auth/PostgREST/JWT reais                            | **0 executados; 18 cenários bloqueados**                              |
| Resultado global `verify:v06`                       | Não aprovado: etapa integrada retorna bloqueio                        |

O runner PostgreSQL mantém seu harness isolado com `auth.users`/`auth.uid()` fictícios. Esses 446 resultados continuam sendo evidência de SQL/RLS nativos, não de login, assinatura/expiração de JWT ou API PostgREST. O fixture Auth não foi aplicado a Supabase real. As quatro migrações não receberam alterações: não há evidência de incompatibilidade real do stack que justificasse uma nova migração.

O terminal também pode emitir aviso de cores `NO_COLOR`/`FORCE_COLOR`, sem relação com segurança. Os testes de navegador verificam ausência de exceções e console do tipo erro.

## Cenários integrados ainda bloqueados

1. Login correto por GoTrue.
2. Login incorreto por GoTrue.
3. JWT legítimo emitido pelo Auth e aceito pelo PostgREST.
4. JWT inválido negado pela API.
5. JWT legítimo expirado negado após sua expiração natural.
6. Renovação real de sessão.
7. Logout e revogação da renovação.
8. Perfil desativado sem acesso de negócio.
9. Usuário sem contrato sem acesso de negócio.
10. Manipulação real de `user_metadata` sem elevação de privilégios.
11. Autopromoção negada por HTTP.
12. Acesso a contrato não autorizado negado.
13. RPC administrativa autorizada.
14. RPC administrativa negada ao leitor e ao próprio alvo.
15. Revogação de permissões em sessão existente.
16. Exposição de tabelas, views, funções e relacionamentos pela API.
17. Histórico administrativo protegido pela API.
18. Matriz dos sete perfis e inativos com JWTs reais.

Não foram fabricados JWTs para substituir as verificações legítimas. A string usada pelo teste unitário do redator de logs é apenas um exemplo de formato, não uma evidência de autenticação.

## Retomada em ambiente compatível

1. Disponibilizar, por ação administrativa apropriada, Docker/Podman compatível e em execução no Windows, ou usar ambiente Linux/macOS suportado. Não apontar `DOCKER_HOST` ou a CLI a infraestrutura remota. O verificador atual aceita o endpoint local padrão; outros sockets/runtimes exigirão revisão explícita do preflight.
2. Executar `npm ci` e `npm run test:integration`. A CLI e o socket podem ser reavaliados sem tocar em dados existentes; a suíte HTTP ainda precisa ser implementada/executada. Ler o relatório e não tratar disponibilidade como validação concluída.
3. Para o teste real, criar workspace e `project_id` exclusivos, portas livres e cópia revisada de `supabase/config.toml`/migrações. Usar `--workdir` explícito e estado local isolado. Não executar `db reset`, `stop --no-backup`, `link` ou `db push` no projeto atual ou em banco preexistente.
4. Iniciar o stack **na cópia descartável**, aplicar as quatro migrações e registrar versões efetivas de PostgreSQL, GoTrue e PostgREST. Nunca aplicar `db-tests/support/auth.sql` nem `docs/supabase-proposta.sql`. Corrigir incompatibilidades somente após reproduzi-las, com migrações adicionais quando necessário.
5. Criar identidades fictícias via Auth Admin confiável, com credencial local apenas no processo Node. Provisionar perfis/vínculos de teste por mecanismo administrativo confiável. Não permitir criação de papéis privilegiados por signup/metadata do cliente.
6. Efetuar login real em `/auth/v1/token?grant_type=password`, obter tokens emitidos por GoTrue e usá-los em requisições `/rest/v1/` e `/rest/v1/rpc/`. A chave de serviço pertence somente ao harness/servidor, nunca ao terminal web. Não registrar tokens/senhas nos artefatos.
7. Para expiração, configurar TTL de teste suportado **somente na cópia** e esperar a expiração do token verdadeiro. Não editar payload, assinatura ou relógio do sistema para simular o caso legítimo. Renovar por `/auth/v1/token?grant_type=refresh_token` e verificar o novo par de sessão.
8. Testar logout real e falha de renovação posterior. Um access token já emitido pode continuar válido até expirar; não confundir logout com revogação imediata do JWT. Se revogação imediata for exigida pelo produto, avaliar política adicional de sessão antes da ativação online.
9. Testar `profiles.active=false` com JWT ainda válido: login Auth não equivale a autorização de negócio; RLS deve negar dados e RPCs. Testar também retirada de vínculos sem trocar a sessão e alterações reais de metadata sem mudança de permissões.
10. Repetir a matriz por API, inclusive filtros por IDs, joins/embeds, fornecedores, referências, view numérica, tabelas privadas, funções e histórico. Uma leitura negada por RLS pode responder `200` com lista vazia; ausência de dados proibidos é a asserção importante, além dos códigos HTTP de escrita/RPC.
11. Encerrar somente o projeto descartável e manter evidências redigidas. Repetir as suítes locais, SQL e navegador. Não ativar o modo online antes da execução completa com resultados revisados.

Referências: [sessões Supabase](https://supabase.com/docs/guides/auth/sessions), [logout e escopos](https://supabase.com/docs/guides/auth/signout), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Comandos e artefatos

```sh
npm test
npm run typecheck
npm run test:db
npm run test:browser
npm run test:integration
# Ou executar a sequência inteira, que termina bloqueada nesta máquina:
npm run verify:v06
```

Relatórios locais ignorados pelo Git: `test-results/integration-results.json`, `database-results.json` e `browser-results.json`. A pasta `.integration-local/` também é ignorada. `test:all` permanece a regressão local/nativa; não é sinônimo de aprovação de autenticação online.

Arquivos novos: `integration-tests/preflight.mjs`, `cases.mjs`, `run.mjs`, `tests/integration-preflight.test.js` e este documento. Alterados: package/lockfile, README, `.gitignore`, rótulo de versão do HTML e mensagem do bloqueio online. Configuração Supabase, migrações, RLS, importador e armazenamento local permanecem sem alterações.
