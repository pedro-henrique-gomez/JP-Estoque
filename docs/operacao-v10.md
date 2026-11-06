# Operação e configuração futura — v1.0

**Não aprovado para piloto; não executar publicação a partir deste documento.** O online continua exclusivo de desenvolvimento local. O gate `DEV`/loopback e a proibição de build online permanecem. Domínio, SMTP, infraestrutura, dados e contas reais precisam de autorização específica. Esta versão fornece ensaios e procedimentos, não uma implantação.

## Ambientes, HTTPS e variáveis

| Ambiente           | Situação                              | Identidades/dados                     | Rede e segredos                                                      |
| ------------------ | ------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| Demonstração       | Padrão preservado                     | Fictícios em localStorage existente   | Sem Auth real; simulador não é login                                 |
| Laboratório online | Disponível por configuração explícita | Auth e PostgreSQL locais descartáveis | Loopback, chave pública no browser; segredos só no harness confiável |
| Homologação/piloto | Não criado, bloqueado                 | Definição e autorização JP pendentes  | Novo artefato sem Vite DEV, HTTPS e gestão de segredos pendentes     |
| Produção           | Fora do escopo                        | Não utilizar                          | Não provisionar                                                      |

Somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` são configuração pública. `VITE_JP_ONLINE_LOCAL=false` continua padrão; a URL existente aceita somente loopback local. Variáveis VITE\_\* são incorporáveis ao bundle: jamais colocar nelas service_role, SMTP password, JWT secret, senha de banco, chave AES ou segredo de assinatura. Não copiar `.env` nem o diretório `.integration-local` para webroot/Git. Separar contas/projetos/volumes/chaves/backups por ambiente, com responsáveis e rotação. `npm ci` usa o lockfile; não atualizar dependências sem regressões e revisão.

Preparação de HTTPS, ainda não testada em infraestrutura aprovada: definir domínio e certificado, TLS no proxy/ingress, allowlist de hosts/redirects exatos, rede privada para Postgres/Studio e controle de acesso operacional. Header HSTS somente após HTTPS estar validado. CSP deve restringir scripts ao próprio artefato, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'self'` e `connect-src` aos endpoints autorizados. O valor final e o tratamento dos estilos inline exigem teste no futuro artefato; não há CSP de produção pronta nesta versão. Headers locais de no-referrer, nosniff, DENY e Permissions-Policy foram adicionados e testados em Vite/preview. Não equivalem a TLS/CSP ou proteção de um servidor publicado.

## Provisionamento sem cadastro público

1. Dono do contrato solicita usuário, finalidade, perfil mínimo e contratos; aprovador JP registra decisão. Não aceitar perfil/vínculos vindos de metadata de signup.
2. Operador com canal administrativo confiável convida a identidade Auth com email autorizado. Futuramente usar `auth.admin.inviteUserByEmail` em ambiente confiável com SMTP aprovado. Service_role nunca vai ao browser, formulário administrativo ou repositório. O laboratório usa `generate_link`/Auth Admin somente com emails `.invalid`, sem enviar mensagens.
3. Usuário confirma o endereço pelo fluxo aprovado e define senha. Não compartilhar senha inicial por email/chat, nem confirmar email manualmente para facilitar onboarding. No laboratório, o token legítimo é verificado diretamente por HTTP; isso não prova entrega de email.
4. Usuário sem `profiles` permanece sem acesso. Cadastrar perfil inicialmente inativo e atribuir contratos por `admin_save_profile`/`admin_set_user_contract`, seguindo aprovação; ativar somente após confirmação e treinamento. As RPCs mantêm a proibição de autoadministração.
5. Registrar aprovador, executor e revisão. Não usar conta compartilhada. Proprietário/administrador exigirão MFA antes do piloto, com fluxo e enforcement ainda pendentes.

O teste de prontidão habilita confirmação de email e TOTP **somente no config do stack descartável**. `supabase/config.toml` e as cinco migrações existentes não são alterados. O modo local normal continua como aprovado na v0.9; sua configuração não pode ser copiada para piloto e considerada segura automaticamente.

## Recuperação e confirmação de email

Ensaiado no Auth real: convite gera identidade sem poder de se atribuir perfil; confirmação válida; login de endereço não confirmado negado quando confirmação está habilitada; token recovery legítimo de uso único; atualização de senha e negação da senha antiga. O harness gera links por API administrativa confiável e consome o token diretamente, sem simular SMTP ou gerar JWT falso.

Pendente de implementação/homologação: UI para solicitar recuperação com mensagem uniforme (sem enumerar emails), callback seguro em rota/redirect HTTPS autorizado, troca de senha, limpeza de URL, tratamento de token expirado/reutilizado e sessão de recuperação com acesso mínimo. Preferir PKCE e estado associado ao navegador; a escolha e compatibilidade devem ser testadas. A aplicação atual tem `detectSessionInUrl=false` e não oferece essas telas. Não colar link de recuperação no login comum nem afirmar que o fluxo completo está pronto.

SMTP real depende de domínio/autorização, SPF/DKIM/DMARC, remetente, limites, reputação e tratamento de bounce. Testar entrega e não entrega, expiração, uso único, destinos fora da allowlist e alteração de email com confirmação. [Documentação oficial de senhas/recuperação](https://supabase.com/docs/guides/auth/passwords).

## MFA e recuperação de acesso privilegiado

TOTP foi ensaiado com Auth real: inscrição, código inválido negado, challenge/verify correto e emissão de sessão AAL2. Não se usaram aplicativos/telefones reais; segredo TOTP ficou em memória e não integra logs. A avaliação não habilita MFA obrigatório no produto: UI de inscrição/desafio/recuperação e enforcement AAL2 em RLS/RPC ainda faltam. Password-only continua suficiente conforme a v0.9, portanto o risco permanece alto.

Antes do piloto, exigir AAL2 nas operações privilegiadas em nova migração, testar também DML direto e perda/revogação de fator, e definir recuperação assistida com verificação de identidade e aprovação separada. Não fornecer bypass pelo frontend, não apagar fator para facilitar teste e não depender apenas de esconder botões. [MFA e níveis de garantia oficiais](https://supabase.com/docs/guides/auth/auth-mfa).

## Revogação, incidentes e manutenção

Desligamento: aprovado por responsável JP; outro administrador desativa `profiles.active` e remove vínculos por RPC. Isso bloqueia leituras/escritas subsequentes com JWT já emitido. Em canal Auth confiável, banir a identidade e revogar refresh/sessões conforme incidente; logout ou ban isolados não devem ser presumidos como invalidação instantânea de todo JWT emitido. Regressões verificam sessão existente e expiração real.

Se a única identidade privilegiada perder acesso, usar procedimento de recuperação assistida por operador confiável, com dupla autorização e auditoria; jamais alterar próprio perfil pelo browser ou remover salvaguarda de último administrador. Fluxo de emergência e custódia ainda precisam ser aprovados pela JP.

Manutenção: registrar versão/hash, backup verificado antes da alteração, janela, regressões e rollback. Migrações históricas permanecem imutáveis; correções usam migração adicional com validação de RLS/grants. Não restaurar banco por cima de dados vivos sem manutenção, avaliação de perda desde o backup e aprovação. Não limpar localStorage para solucionar falhas.

## Logs e monitoramento

`scripts/operations/events.mjs` define eventos com allowlist: tipo, status, duração e horário; não aceita payload, usuário, contrato, email, SQL ou credenciais. O harness produz somente resultados e métricas agregadas. Não há coletor remoto nem observabilidade operacional instalada.

Preparar coleta segregada de métricas Auth/API, latência p50/p95/p99, códigos de erro/negação, lock waits, filas, disco, conexões, idade do último backup e último restore. Usar IDs técnicos de requisição, não nomes/emails em labels. Definir alertas/retention/plantão com a JP. Debug Auth permanece desligado. Não registrar Authorization, cookies, refresh token, JWT, links recovery, QR/segredo TOTP, token de prévia, planilha ou corpo SQL. A auditoria do banco contém dados completos e deve ter acesso restrito e política LGPD; não replicá-la para logs públicos. Analisar configuração de logs de erros PostgreSQL/PostgREST no ambiente futuro, pois mensagens SQL podem incluir parâmetros.
