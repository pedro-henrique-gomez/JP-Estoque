# JP Estoque v0.7 — autenticação e consulta no Supabase local

## Escopo e estado

Implementado a partir de `16db597`. O modo **demonstração continua sendo o padrão**, com as funções, permissões, importação Excel e dados locais anteriores. O modo online é experimental, exclusivo do servidor de desenvolvimento e limitado a Supabase em loopback. Não houve publicação, conexão a serviços remotos, mudança nas quatro migrações ou nos processos de RM, OC, compras e recebimento.

O modo online oferece login/logout reais, recuperação da sessão, renovação de tokens e consulta de materiais, contratos, saldos, fornecedores/localizações associados e referências existentes OC/NF. RLS é a autoridade de autorização. Não há simulação de login, seleção de perfis, edição de permissões pelo cliente ou fallback de dados online para demonstração.

A área administrativa online apenas informa se o perfil obtido do banco tem capacidade administrativa; **não oferece escrita, importação ou gerenciamento online nesta versão**. As funções administrativas do modo demonstração permanecem disponíveis. As RPCs existentes continuam protegidas por RLS/verificações de servidor e foram revalidadas pelos cenários v0.6.

## Executar sem alterar configurações existentes

Requisitos: Node.js 22.12+, Docker Linux local em execução, pelo menos 4 GiB totais disponíveis ao engine e portas 56320/56321/56322/5183 livres. O stack testado dispõe de aproximadamente 7,4 GiB totais. A execução baixa imagens oficiais se necessário; não usa um projeto Supabase remoto.

```sh
npm ci
# Caminho padrão, demonstração:
npm run dev

# Caminho explicitamente experimental, stack novo e descartável:
npm run dev:online
# Após interromper a interface com Ctrl+C, confirme o encerramento:
npm run dev:online:stop
```

`dev:online` cria uma cópia UUID de `supabase/config.toml`/migrações em `.integration-local/`, usa rede/projeto próprios, aplica as quatro migrações pelo executor real e provisiona quatro identidades fictícias via Auth Admin local. Há dois contratos e saldos fictícios: leitor do contrato A, proprietário com acesso a A/B, usuário inativo e usuário sem contrato.

O terminal mostra a URL `http://127.0.0.1:5183/code/html/index.html` e **somente o caminho** de `fictitious-users.json` dentro do workspace descartável. Abra esse arquivo local para obter os emails e senhas de teste. Ele é ignorado pelo Git; mantenha-o privado. Nenhuma senha, chave administrativa ou token é impresso pelo launcher. O arquivo não contém `service_role`, senha PostgreSQL ou segredo de assinatura; contém credenciais de contas Auth fictícias daquele ambiente local, incluindo um proprietário fictício.

O Vite recebe apenas a URL e a chave pública/anon. A operação administrativa de provisionamento acontece exclusivamente no processo Node. O frontend não cria perfis privilegiados. Interrompa a interface com Ctrl+C e execute `npm run dev:online:stop` para confirmar o encerramento, especialmente no Windows, onde alguns terminais encerram o processo antes do `finally`. O comando usa o manifesto do projeto UUID, confere a propriedade do lock e recusa parar um launcher ainda ativo ou uma execução diferente. Não mata outros processos nem remove volumes; preserva os backups padrão e remove somente a rede/lock daquele experimento. É seguro repeti-lo depois de uma limpeza já concluída. Se o manifesto estiver ausente/incompatível, examine os registros antes de agir; não use limpeza global de contêineres/volumes. A CLI publica portas Docker por padrão em todas as interfaces; use ambiente de desenvolvimento confiável. O Vite fica em `127.0.0.1` e o transporte da aplicação aceita exclusivamente loopback.

O comando não grava `.env`, não altera o modo padrão, não migra dados, não conecta ao banco usado por outro projeto e não substitui contêineres existentes. Portas ocupadas provocam falha. Nunca aplicar `db-tests/support/auth.sql` ao stack real.

## Usar um Supabase local próprio, já preparado

Opcionalmente, copie `.env.example` para **`.env.development.local`**, sem sobrescrever um arquivo existente, e preencha:

```dotenv
VITE_JP_ONLINE_LOCAL=true
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<somente-chave-publica-publishable-ou-anon-local>
```

Também é permitido `http://127.0.0.1:56321`. URLs remotas, hostnames alternativos, credenciais na URL, caminhos/query/hash e chaves secretas/service-role são recusados. A checagem de chave é uma proteção contra configuração acidental; não autentica nem autoriza usuários. A assinatura e a autorização são verificadas pelos serviços reais.

O banco local próprio precisa ter as quatro migrações aprovadas, uma identidade Auth legítima e perfil/vínculos provisionados por mecanismo administrativo confiável. Não crie um papel privilegiado por signup ou metadata. O launcher descartável é a alternativa pronta para testar sem tocar nesse banco.

Execute `npm run dev`. Para voltar ao modo demonstração, remova **apenas a configuração experimental que você adicionou** ou use `VITE_JP_ONLINE_LOCAL=false` e reinicie o Vite. Não apague dados locais. `npm run build`/preview não ativam o online: `DEV` deve ser verdadeiro. Uma flag online acidental no ambiente de produção é recusada, sem realizar conexão.

## Implementação e limites de confiança

- `code/js/bootstrap.js`: resolve a configuração antes de carregar os módulos de demonstração ou online. Não há seletor de perfil na interface online. Nenhuma chave de armazenamento habilita o modo online.
- `code/ts/data/online-config.ts`: exige opt-in explícito de desenvolvimento e endpoint local. `createBackend()` e os adaptadores demonstrativos continuam independentes e sem I/O durante sua construção.
- `vite.config.js`: valida a configuração antes de servir a página, recusando chaves administrativas sem enviá-las ao navegador; bloqueia build/preview com opt-in online. Serve somente código, imagens, arquivos públicos e dependências. `.env`, workspaces descartáveis, bancos locais, relatórios e fixtures administrativas ficam fora da lista permitida; tentativas de acesso HTTP, inclusive com variação de caixa no Windows, são testadas e negadas.
- `code/ts/data/online.ts`: cliente oficial `@supabase/supabase-js` 2.119.0 (MIT), com `signInWithPassword`, `signOut`, `getSession`, `getUser`, auto-refresh e consultas PostgREST. Fetch limitado ao origin local validado e aos caminhos Auth/REST, sem redirecionamentos e com timeout. Nenhum módulo administrativo do harness é importado pelo frontend.
- Recuperação não confia no usuário cacheado: `getUser()` consulta Auth e o perfil é lido de `profiles` com identidade verificada. `user_metadata`/`app_metadata` armazenadas no navegador não definem perfil nem vínculos. O perfil é confirmado novamente ao final da consulta.
- Sessão fica em `sessionStorage` na chave `jp_online_v07_<porta>`, com tokens geridos pelo SDK. `detectSessionInUrl=false` impede adotar tokens de URL. Nenhuma chave de dados existente do JP no `localStorage` é lida, migrada, apagada ou sobrescrita pela rota online. O SDK faz uma sondagem de suporte criando/removendo uma chave aleatória temporária `lswt-*` e pode ler sua chave própria de depuração de locks; não persiste tokens nesse armazenamento. O teste verifica os valores e o conjunto final exato das chaves preexistentes. Não existe “lembrar-me” com persistência de sessão via localStorage.
- `contract_balances_api` mantém quantidades como strings decimais; `1.250001` é exibido sem converter para float. Contratos, catálogo, saldos, localizações, fornecedores e referências são consultados por JWT do usuário, com paginação de 300 registros por requisição e RLS em todas as tabelas/views subjacentes.
- O componente usa `textContent` para dados recebidos. Não injeta HTML de materiais/usuários. Filtros locais apenas refinam dados já autorizados pelo servidor; não são tratados como segurança.
- Consultas removem os dados anteriores da tela enquanto verificam a sessão/permissões. Respostas de consulta anterior são descartadas após logout/eventos de invalidação. Perfil inativo, perfil ausente, ausência de contratos, pesquisas vazias, sessão inválida e indisponibilidade da conexão têm mensagens distintas.
- Nova consulta ao focar a janela, clicar “Atualizar consulta”, renovar token ou a cada 30 segundos com a página visível. Revogação é efetiva no servidor na próxima requisição; um snapshot já exibido pode permanecer até a próxima atualização. Não se promete apagar conhecimento/dados que o usuário já recebeu legitimamente.
- Logout limpa a sessão local e solicita revogação global ao Auth. Se a rede impedir a confirmação, a interface informa o encerramento local sem afirmar revogação remota. Access JWTs emitidos podem continuar válidos até expiração/tolerância; vínculos/status de negócio continuam controlados pelo banco em cada requisição.

Referências oficiais: [sessão e armazenamento no SDK](https://supabase.com/docs/reference/javascript/auth), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [eventos Auth](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [logout](https://supabase.com/docs/guides/auth/signout).

## Validação

```sh
npm test
npm run typecheck
npm run test:db
npm run test:browser
npm run test:integration  # 18 cenários HTTP v0.6 preservados
npm run test:online       # Chromium + Auth/PostgREST reais
npm run verify:v07       # todas as camadas, em sequência
```

A suíte online usa um stack próprio, GoTrue/PostgREST reais e contas `@example.invalid`, provisionadas por Auth Admin no Node. São nove comportamentos em desktop e celular, totalizando 18 testes Chromium:

1. Página inicial protegida, login incorreto e preservação do armazenamento local.
2. Login correto, isolamento A/B por HTTP/RLS, pesquisa por NF, filtros e detalhes com saldo fracionário.
3. Recuperação após reload, identidade cacheada adulterada ignorada, área administrativa protegida e logout real.
4. Usuário inativo e usuário sem contratos com mensagens explícitas.
5. Proprietário consulta todos os contratos, sem controles de escrita online.
6. Revogação de vínculo e desativação afetam a sessão já aberta na próxima consulta.
7. Falha real de rede com remoção de dados antigos e recuperação por retry.
8. Refresh revogado no Auth volta ao login ao recuperar a sessão. Apenas o metadado de agendamento do cache é expirado para acionar o SDK; não se altera a assinatura/payload do JWT legítimo.
9. Renovação automática aguardada no relógio real, com novos tokens emitidos por GoTrue e consulta funcional após reload. Nenhum token é falsificado para esse teste.

O harness online usa TTL de 180 segundos, compatível com a margem de renovação de 90 segundos do SDK. O harness HTTP v0.6 mantém TTL de 60 segundos e sua espera por expiração natural mais tolerância do PostgREST. Essa configuração muda somente na cópia descartável.

Traces, screenshots e vídeo estão desligados nos testes de autenticação para não capturar credenciais. Asserções sobre tokens registram somente booleanos. Um reporter próprio redige JWTs/senhas/refresh tokens e sanitiza os artefatos de erro, sem imprimir corpos/headers sensíveis. Os testes unitários com mocks são identificados como tais e não contam como evidência de autenticação real.

## Correções durante a validação

- Corrigida uma asserção de logout que verificava o cache antes de aguardar a operação Auth. O teste passou a esperar o resultado; o formulário também evita iniciar outro login durante o encerramento.
- Esse diagnóstico intermediário incluiu um token de conta fictícia em uma falha de asserção. O artefato local foi sanitizado e o ambiente descartável foi encerrado. Asserções/reporter foram alterados para impedir repetição; nenhum token/credencial foi incluído no commit.
- Uma interrupção exploratória deixou um servidor Vite do próprio teste ativo. Ele foi identificado pelo PID/comando e encerrado, sem interferir em serviços de terceiros. A checagem de porta agora testa especificamente o endereço loopback e tem teste automatizado de porta ocupada.
- Ctrl+C no terminal Windows encerrou o launcher manual antes do `finally`. Foi adicionado `dev:online:stop`, com manifesto/PID/lock e escopo exclusivo do projeto descartável. Foram executados smoke de login/consulta/logout no launcher real, rejeição de encerramento com manager ativo, encerramento após interrupção e repetição idempotente, sem deixar contêineres ou lock.
- Problemas de codificação dos arquivos novos no PowerShell foram corrigidos antes da execução final. Os arquivos de teste usam UTF-8 adequado.
- O teste de zero escritas em localStorage identificou a sondagem temporária do SDK. A asserção foi ajustada ao requisito de preservação: permite apenas essa sondagem removida, exige os valores e o conjunto final exato de chaves preexistentes e rejeita persistência de tokens ou gravações em chaves do JP.
- Uma rodada intermediária atingiu timeout ao observar renovação enquanto os fontes/servidor de desenvolvimento ainda recebiam ajustes. A execução final mantém os fontes congelados, registra a resposta de refresh desde antes do login e aguarda também a gravação do token pelo SDK, sem alterar relógio ou fabricar JWTs.

## Limitações restantes

Não pronto para produção. A aplicação online nesta versão é **somente leitura**, sem cadastro/edição, importação, provisionamento de usuários pela interface ou movimentação de estoque. Não implementa cadastro público, recuperação de senha, email/SMTP, MFA, OAuth, callbacks, BFF/cookies HttpOnly, hospedagem ou banco compartilhado remoto. Tokens do cliente SPA permanecem acessíveis ao JavaScript da própria origem; nenhuma promessa de proteção contra comprometimento da origem é feita.

A validação cobre as versões locais já usadas na v0.6: PostgreSQL 17.11, GoTrue v2.197.0, PostgREST v16.5 e CLI 3.0.0. Não valida desempenho sob grandes volumes nem instalação remota. As quatro migrações/RLS e as evidências históricas da v0.6 permanecem preservadas.
