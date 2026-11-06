# JP Estoque v0.8 — administração no Supabase local

## Resultado e escopo

Implementação a partir de `4019ec4`, preservando a demonstração como padrão, autenticação/consulta da v0.7 e evidências históricas. O modo online continua experimental, somente em desenvolvimento e Supabase local. Não houve publicação, conexão remota, dados corporativos, novas dependências ou alteração das quatro migrações/políticas RLS.

O painel online permite:

- Consultar, cadastrar, editar e excluir materiais do **catálogo global**, contratos, fornecedores e localizações físicas.
- Gerenciar vínculos individuais entre usuários e contratos pelas RPCs existentes, com confirmação de autorização/revogação.
- Editar nome, email cadastral, perfil e status de **outros usuários já provisionados** pela RPC aprovada. O email cadastral não altera o email de login do Auth.
- Consultar os 100 eventos de auditoria mais recentes, incluindo ator, operação e antes/depois, e os registros administrativos de importações já existentes, somente leitura.

Não há edição/criação de saldos, movimentações, importação Excel online, processos RM/OC/compras/aprovação/recebimento, criação de contas Auth ou gerenciamento de senhas pelo navegador. A importação e a administração demonstrativas permanecem inalteradas. Um produto novo sem saldo aparece no catálogo administrativo, sem inventar saldo em um contrato.

## Configuração e uso

```sh
npm ci
npm run dev                # demonstração, padrão
npm run dev:online         # stack descartável e interface online local
# Após Ctrl+C, confirme a limpeza, especialmente no Windows:
npm run dev:online:stop
```

O launcher conserva as garantias da v0.7: projeto/rede UUID, portas livres, somente socket Docker local, cópia das migrações/configuração e fixture Auth Admin exclusivamente no Node. Os emails/senhas fictícios são gerados aleatoriamente e ficam somente no arquivo local ignorado cujo caminho é informado; senhas/chaves não são impressas. O frontend recebe apenas URL local e chave pública/anon.

A v0.8 provisiona nove identidades fictícias: proprietário, administrador, funcionário autorizado, coordenador, diretor, almoxarife, planejamento, usuário inativo e usuário sem contrato. Use proprietário ou administrador para abrir **Administração**. Os demais recebem acesso negado ao painel. As consultas de materiais continuam seguindo RLS.

Também é possível configurar `.env.development.local` explicitamente, sem sobrescrever um arquivo existente:

```dotenv
VITE_JP_ONLINE_LOCAL=true
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<somente-chave-publica-local>
```

A porta 56321 também é permitida. O Vite valida a configuração antes de servir a página. URLs remotas, chaves administrativas e ativação online em build/preview são recusadas. Nenhuma configuração de demonstração/localStorage ativa o online. O launcher manual usa `http://127.0.0.1:5183/code/html/index.html`; a CLI publica as portas Docker em todas as interfaces por padrão, portanto o ambiente continua restrito a uma máquina/rede de desenvolvimento confiável.

Credenciais temporárias, bancos, fixtures Node, `.env` e relatórios não são servidos pelo Vite. O encerramento explícito verifica manifesto/PID/lock, recusa outra execução ainda ativa e encerra somente o projeto descartável, preservando backups. Detalhes de sessão e configuração originais: [guia v0.7](autenticacao-local-v07.md).

## Matriz de permissões

| Perfil ativo            | Consulta de contratos | Cadastros online       | Perfis/vínculos          | Auditoria/registros administrativos |
| ----------------------- | --------------------- | ---------------------- | ------------------------ | ----------------------------------- |
| PROPRIETARIO            | Todos                 | Criar, editar, excluir | Outros usuários, via RPC | Leitura                             |
| ADMINISTRADOR           | Todos                 | Criar, editar, excluir | Outros usuários, via RPC | Leitura                             |
| DIRETOR                 | Todos                 | Negado                 | Negado                   | Negado                              |
| COORDENADOR             | Somente autorizados   | Negado                 | Negado                   | Negado                              |
| PLANEJAMENTO            | Somente autorizados   | Negado                 | Negado                   | Negado                              |
| ALMOXARIFE              | Somente autorizados   | Negado                 | Negado                   | Negado                              |
| FUNCIONARIO_AUTORIZADO  | Somente autorizados   | Negado                 | Negado                   | Negado                              |
| Qualquer perfil inativo | Negado                | Negado                 | Negado                   | Negado                              |
| Sem sessão válida       | Negado                | Negado                 | Negado                   | Negado                              |

O bloqueio de autoadministração permanece inclusive para proprietário/administrador: não podem alterar o próprio perfil/status nem os próprios vínculos. A interface desabilita esses controles e o banco os rejeita independentemente da interface. O perfil é obtido de `profiles` com identidade verificada pelo Auth; metadata ou seletores de frontend não concedem privilégios.

## Mecanismos existentes e análise de lacunas

Não foi necessária migração adicional nem nova RPC. As operações solicitadas já estão contempladas nos mecanismos aprovados:

| Operação                                       | Mecanismo no servidor                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Materiais/contratos/fornecedores/localizações  | Grants por coluna + políticas `admin_insert`, `admin_update`, `admin_delete` da segunda migração |
| Leitura administrativa                         | RLS de tabelas existentes; perfil ativo de proprietário/administrador                            |
| Perfil/status de outro usuário                 | `public.admin_save_profile`                                                                      |
| Autorizar/revogar vínculo de outro usuário     | `public.admin_set_user_contract`                                                                 |
| Identidade, status e permissão do ator         | `auth.uid()` e perfil protegido no banco; `private.require_other_user_admin`                     |
| Autoadministração e concorrência de permissões | Verificação de alvo diferente do ator, mutex e locks existentes                                  |
| Integridade e exclusões                        | Chaves estrangeiras, restrições de unicidade/CHECK e proteção do último gestor já existentes     |
| Auditoria                                      | Triggers `stamp` e `audit`; nenhum INSERT/UPDATE/DELETE de auditoria concedido ao cliente        |

As quatro migrações são conferidas por SHA-256 e aplicadas pelo executor da CLI em stacks novos. O fixture `db-tests/support/auth.sql` continua restrito ao runner PostgreSQL nativo; nunca é aplicado ao Supabase real. Nenhuma regra foi enfraquecida para facilitar o frontend.

A criação de identidades Auth, alteração de senha/email de login e configurações gerais online ficam fora do escopo; não foi adicionada uma API privilegiada no navegador para preencher essas lacunas futuras. O usuário precisa existir no Auth e possuir perfil provisionado por mecanismo confiável para aparecer no gerenciamento.

## Implementação e confirmação

- `code/ts/data/online-administration.ts` centraliza as operações e usa a capacidade `manage_users` já definida em `access.ts`. O cliente revalida Auth/perfil antes das operações e ao concluir a leitura administrativa; RLS/RPC permanecem a autoridade final, mesmo se essas checagens forem burladas.
- Entidades de escrita limitadas a produtos, contratos, fornecedores e localizações. Campos não permitidos (como quantidade, perfil, timestamps ou tabelas internas) não são encaminhados pelo adaptador. Não há mutador de saldo ou auditoria nesse módulo.
- INSERT/UPDATE/DELETE de cadastro solicitam retorno de `id` e exigem exatamente uma linha. HTTP 200 com lista vazia por RLS/registro removido não é anunciado como sucesso. As RPCs de vínculo são operações de estado idempotentes, autorizadas no servidor.
- Toda alteração exige diálogo de confirmação; cancelar/Escape não envia a alteração. Dados são renderizados com `textContent`, sem HTML vindo dos registros.
- Erros de duplicidade, integridade, validação, sessão e acesso negado recebem mensagens claras. Falhas de rede não repetem escritas automaticamente; a interface orienta atualizar antes de tentar novamente. Se a escrita foi confirmada mas a releitura falhar, a mensagem distingue os dois resultados.
- Retirada de permissão ou desativação impede novas operações com o mesmo JWT. Durante o painel, foco/poll revalidam permissão sem apagar formulários ainda autorizados. Escritas também verificam o perfil e são avaliadas pela RLS no servidor.
- Logout/invalidação limpa dados, formulários e resumo de confirmação. Respostas antigas de alterações não repovoam uma sessão encerrada. Uma requisição já enviada pode concluir no servidor se ainda autorizada naquele momento; logout não é rollback de transações nem revogação instantânea de um access JWT emitido.
- Sessão continua no `sessionStorage` da v0.7; nenhuma chave de dados do JP no localStorage é migrada, limpa ou sobrescrita. O SDK mantém apenas sua sondagem temporária `lswt-*` já documentada, sem persistir tokens em localStorage.
- O catálogo global e os saldos continuam separados. Testes comparam todos os saldos antes/depois de cadastros administrativos e exigem igualdade.

Referências oficiais do SDK: [retorno de linhas após update](https://supabase.com/docs/reference/javascript/update), [insert](https://supabase.com/docs/reference/javascript/insert), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Testes reais e regressões

```sh
npm run verify:v08
# Executa: testes unitários, TypeScript, PostgreSQL nativo,
# build/Chromium demonstrativo, 18 cenários HTTP v0.6 e Chromium online.
```

O teste online exige **44 resultados aprovados e zero ignorados**: os 18 fluxos da v0.7 (nove em desktop/celular) e 26 resultados novos de administração (13 em desktop/celular). O cenário antigo de proprietário foi atualizado exclusivamente para reconhecer os novos controles administrativos aprovados, mantendo consulta global e ausência de importação/edição de saldos.

Cenários novos:

1. Cinco perfis sem administração (funcionário, coordenador, diretor, almoxarife e planejamento): painel negado; INSERT negado em quatro cadastros; UPDATE/DELETE sem efeito; RPC negada; auditoria vazia.
2. Proprietário e administrador: criar, editar e excluir catálogo/contratos/fornecedores/localizações, cancelar confirmação sem escrita, manter saldos intactos e registrar INSERT/UPDATE/DELETE com ator correto.
3. Autorizar e revogar vínculo pela interface/RPC, verificando mudança de acesso em JWT legítimo já existente.
4. Autoadministração negada nos dois gestores, escrita direta de perfil/vínculo negada e edição de status de outro usuário via RPC.
5. Auditoria imutável inclusive aos gestores; duplicidade e exclusão de contrato vinculado preservam dados existentes.
6. Perfil de gestor revogado com formulário aberto: interface e HTTP impedem gravação.
7. Registro removido por outra requisição antes de salvar: zero linhas afetadas é tratado como operação não confirmada.
8. Logout limpa rascunhos/confirmações administrativas e preserva o armazenamento demonstrativo.

Todos utilizam GoTrue/PostgREST e JWTs legítimos, com SQL administrativo confiável apenas para provisionamento e mudança de papel no teste de revogação. Não há mocks nos fluxos Chromium. Os 23 testes unitários novos usam doubles identificados e não contam como autenticação real. Traces/screenshots/vídeos de Auth continuam desligados; reporter sanitiza credenciais e artefatos. Resultados finais estão em [relatorio-v08.md](relatorio-v08.md) e [evidencias-v08.json](evidencias-v08.json).

## Limitações

Não pronto para produção. Sem hospedagem ou Supabase remoto, criação de usuários Auth, recuperação de senha, SMTP, MFA/OAuth, importação online, processos de compras ou movimentações. A auditoria exibida é limitada aos 100 eventos mais recentes; não há exportação nem busca histórica avançada. Cadastros concorrentes seguem o comportamento transacional existente, sem controle otimista de versão para formulários; auditoria conserva antes/depois. Não houve teste de carga ou auditoria exaustiva. As garantias/limites de sessão da v0.7 permanecem.
