# Supabase — configuração futura, não executada na v0.5

Nenhuma etapa de nuvem abaixo foi executada por esta entrega. Não há projeto remoto, contas Auth reais, segredo operacional ou serviço pago ativado. O terminal permanece local, e preencher `.env` não ativa online.

## 1. Reproduzir a validação sem nuvem

```sh
npm ci
npm test
npm run typecheck
npm run test:db
npm run test:browser
```

Para Playwright em máquina nova: `npx playwright install chromium` antes de `test:browser`. O teste de banco não precisa de Docker: `embedded-postgres@17.11.0-beta.19` fornece PostgreSQL 17.11 nativo e `pg@8.23.1` é o driver. Ambos são dependências apenas de desenvolvimento, não entram no bundle web. O wrapper usa licença MIT; seus binários distribuídos seguem a licença informada pelo projeto [embedded-postgres](https://github.com/leinelissen/embedded-postgres). A dependência e integridades estão fixadas no lockfile.

O runner cria um diretório novo em `.local-db/` e senha aleatória em memória para a conexão de teste, escuta somente em `127.0.0.1`, não instala serviço e para o processo ao terminar. Não aceita URL externa ou variável para apontar a um banco real. Os clusters são locais/ignorados pelo Git e podem ser removidos manualmente depois de encerrados; não contêm dados corporativos. Em Linux, executar como usuário normal, não root; o runner não cria usuário de sistema.

## 2. Preparar Supabase local futuramente

Seguir a [documentação oficial da CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). Instalar uma versão estável da CLI, registrar sua versão e usar um runtime local suportado. O stack Supabase completo não foi iniciado nesta entrega porque não havia Docker/CLI instalados. O teste nativo de PostgreSQL não equivale ao stack completo.

O repositório já possui `supabase/config.toml` com PostgreSQL 17, signup público desativado, schema de API `public` e sem seed automático. Rever opções contra a versão da CLI escolhida e, em uma instância **local descartável**, executar:

```sh
npx supabase --version
npx supabase start
npx supabase db reset --local
```

`db reset --local` recria somente o banco de desenvolvimento local e aplica as migrações versionadas. Não usar num banco com dados que precisem ser preservados. Não aplicar `db-tests/support/auth.sql`: ele é stub exclusivo do runner nativo e conflita com Auth real. Não aplicar `docs/supabase-proposta.sql`, que é histórico da v0.2.

Após aplicar, repetir as mesmas operações de `db-tests/run.mjs` por conexões/API locais com identidade real, em transações descartáveis. `supabase test db` exigirá a futura suíte pgTAP/HTTP equivalente para esse ambiente; a suíte atual é o runner Node contra PostgreSQL nativo, e não é apresentada como pgTAP executado.

## 3. Criar um projeto gratuito depois

1. Criar/acessar a própria conta no painel Supabase. Escolher a organização e o plano **Free**, sem ativar upgrade, add-ons pagos ou recursos extras. Conferir os limites atuais na [página oficial de preços](https://supabase.com/pricing).
2. Criar um projeto de teste dedicado, escolher região e uma senha forte de banco, guardada fora do Git. Verificar que a versão PostgreSQL de destino é compatível com a 17 usada nos testes.
3. Não conectar o terminal atual nem usar dados corporativos nessa fase. Revisar migrações e criar backup caso o projeto não esteja vazio.
4. Depois da validação local completa, usar `npx supabase login`, `npx supabase link --project-ref <REF_DO_PROJETO_DE_TESTE>` e revisar `npx supabase db push --dry-run`. Só então executar `npx supabase db push`. Confirmar as opções na CLI instalada; estes comandos não foram executados nesta entrega.
5. Aplicar migrações pelo papel confiável de migração. Os defaults de privilégios são alterados para objetos futuros desse papel; revisar antes de aplicar a projeto compartilhado preexistente.

## 4. Autenticação e primeiro perfil

Manter cadastro público desativado durante a preparação. Configurar o provedor de email e URLs permitidas de redirecionamento para o domínio que será realmente usado. Para desenvolvimento, o config aponta para `http://localhost:5173/code/html/index.html`. Ainda falta implementar no aplicativo o fluxo de callback, sessão, logout e tratamento de erros; não há tela de login nesta versão.

Criar futuramente identidades de teste pelo Dashboard/Auth Admin em operação confiável, com email de teste e confirmação apropriada. O ID de `profiles` é exatamente o UUID de `auth.users`; não copiar nome/perfil/status de metadata editável pelo usuário. Nenhum trigger concede perfil administrativo na criação de uma conta.

O primeiro Proprietário deve ser provisionado por SQL administrativo revisado ou rotina de servidor confiável, usando o UUID exato de uma identidade Auth já verificada. Isso não é permitido pela UI ou por signup. Provisionar depois outros gestores pelas RPCs e manter um responsável ativo. A própria conta não pode mudar seu perfil/status/vínculos por RPC; usar outro gestor autorizado. Não foi criado nenhum perfil Auth real por estas migrações.

## 5. Chaves e adaptadores

`.env.example` contém somente placeholders vazios de URL e publishable key; a v0.5 não os lê. `.env` e variantes reais são ignorados pelo Git. A futura chave publicável não representa autorização de usuário: operações continuam dependendo da sessão válida e de RLS. Nunca usar `service_role`, secret key, senha PostgreSQL ou Auth Admin no frontend ou em variável `VITE_*`.

Implementar a futura conexão em adaptador novo para as portas de `code/ts/data/contracts.ts`. Usar TLS no ambiente hospedado, JWT validado e `contract_balances_api` para quantidades decimais textuais. Operações administrativas devem executar RPCs com a identidade validada do ator. Se um endpoint usar segredo de servidor para provisionar Auth, ele precisa validar previamente o chamador e produzir auditoria confiável; segredo de serviço não concede autorização de negócio ao chamador.

## 6. Checklist que bloqueia ativação online

- [ ] Stack Supabase local e versão de destino confirmados.
- [ ] Quatro migrações aplicadas com o executor real de migração; grants/defaults inspecionados.
- [ ] Matriz de acesso repetida via PostgREST/RPC com JWTs reais para cada perfil e inativos.
- [ ] Autenticação, confirmação de email, expiração/renovação/logout e callback testados.
- [ ] Tentativas de autopromoção, alteração de metadata e acesso direto a tabelas/relacionamentos negadas via HTTP.
- [ ] Provisionamento do primeiro gestor, revogação e concorrência auditados.
- [ ] Adaptadores online, precisão numérica, erros e limites de consulta implementados/testados.
- [ ] Backup/restauração, índices e desempenho validados no volume esperado.
- [ ] Decisão explícita de ativação em nova versão; nenhuma migração automática do localStorage.

Só uma versão posterior poderá remover o bloqueio de `online`. O simulador de perfis e filtros locais nunca podem ser promovidos a mecanismo de autenticação.
