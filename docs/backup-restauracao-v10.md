# Backup, restauração e recuperação — v1.0

**Ensaio local SQL aprovado; recuperação operacional completa ainda pendente.** O procedimento abaixo foi exercitado com dados fictícios em um stack isolado. Não é um comando para restaurar dados reais nem comprova DR em outro host. O piloto continua bloqueado até cumprir os critérios de recuperação e custódia aprovados pela JP.

## Executar o ensaio reproduzível

Pré-requisitos: Node compatível, `npm ci`, Docker Linux com ao menos 4 GiB, portas 56320/56321/56322/5183/5193 disponíveis conforme o launcher. Não selecionar outro banco ou contêiner. Execute `npm run test:readiness` a partir do checkout. O launcher preserva o config de origem, cria projeto/rede/workspace únicos e aplica as cinco migrações. Contas Auth e materiais são exclusivamente fictícios. A identificação do contêiner usa **rede descartável e porta**, não um nome presumido: a CLI trunca o project ID. O harness recusa alvo ambíguo.

Passos realmente testados:

1. Preparar identidades, contratos, importações e referências fictícios; executar os testes Auth e de saldos antes do backup.
2. Calcular impressão SHA-256 dos dados de cada tabela de `public`, `private`, `auth` e `supabase_migrations`, sem imprimir seu conteúdo.
3. Executar `pg_dump -Fc` completo da base `postgres` do contêiner identificado. O binário vem da própria imagem PostgreSQL utilizada, evitando incompatibilidade de versão. Capturar a saída binária limitada a 32 MiB em memória; não escrever um dump plaintext no host.
4. Cifrar com AES-256-GCM, nonce aleatório e AAD/versionamento; salvar somente o envelope cifrado no workspace ignorado. A chave de 256 bits existe somente na memória deste ensaio. Testar que chave incorreta e conteúdo alterado falham na autenticação criptográfica.
5. Criar uma **nova** base `jp_restore_<UUID>` a partir de template0. Não há `--clean`, renomeação, exclusão ou sobrescrita da base fonte.
6. Descriptografar em memória e alimentar `pg_restore --exit-on-error` via stdin, dentro do próprio contêiner, como papel interno confiável `supabase_admin`. O restore com papel `postgres` falhou no ensaio inicial; não foi contado como sucesso. O papel de restore nunca é entregue à aplicação/browser.
7. Comparar as 43 tabelas, constraints, políticas RLS, flags ENABLE/FORCE RLS, grants e definições/permissões de funções administrativas e privadas. A comparação inclui usuários/identidades/fatores Auth e a chave privada da importação. Dados de negócio e segredo não aparecem no relatório.
8. Executar consulta como papel `authenticated` com claims SQL de um leitor fictício, na base restaurada: somente um contrato autorizado e acesso negado à chave privada. Essa verificação é de RLS SQL, **não** uma nova autenticação HTTP contra a base restaurada.
9. Fechar a conexão e remover somente a base temporária criada pelo teste, depois da validação. Encerrar apenas o stack descartável pelo launcher, preservando backups locais ignorados. Zeragem das buffers de chave/dump quando o ensaio termina com sucesso.

`readiness-tests/run.mjs`, `scripts/operations/archive.mjs` e `scripts/operations/events.mjs` implementam o ensaio. `test-results/readiness-results.json` contém durações/contagens, sem dump, chave, senha, JWT, token de convite/recovery ou TOTP. Nenhum arquivo de backup é versionado. Os testes unitários da criptografia não são contados como restore real; o restore real usa pg_dump/pg_restore.

**Importante:** a chave descartada ao final torna o arquivo cifrado do laboratório intencionalmente irrecuperável após o processo. Ele não é um backup operacional reutilizável. Não copiar este modelo de custódia para o piloto. O objetivo é provar cifragem, integridade e restauração durante a vida controlada da chave; a custódia durável e separada ainda depende de infraestrutura aprovada.

## Cobertura e lacunas

O ensaio preserva as tabelas completas do Auth e da aplicação em uma base nova, mas no **mesmo cluster/host**, com roles/extensões já disponíveis. Não inclui restauração de roles globais do cluster, certificados, variáveis de ambiente, chave JWT, configuração GoTrue/PostgREST/Kong, serviços SMTP, DNS, frontend ou volumes fora do banco. Não há Storage de arquivos no escopo; arquivos Excel não são persistidos.

Não se apontou GoTrue/PostgREST para a base restaurada; login HTTP/UI pós-restauração e recuperação em outra máquina são pendências explícitas. As suítes HTTP reais validam o stack fonte em execuções independentes. O tempo medido de dump/restore é apenas do pequeno laboratório, sem contratação de RPO/RTO e sem prova de recuperação após perda de host/segredos.

## Procedimento futuro a aprovar com a JP

1. Definir RPO (perda máxima tolerável), RTO (tempo máximo de recuperação), retenção, frequência, tamanho esperado, responsável e aprovador. Não presumir que um backup diário é suficiente.
2. Guardar backups cifrados fora do host, com acesso mínimo, autenticação forte, proteção contra alteração/remoção e cópia independente conforme política. Separar a chave em secret manager/KMS com recuperação testada por custodiante; não guardá-la ao lado do arquivo, no Git ou em VITE\_\*.
3. Versionar manifest de serviços/imagens/digests/config sem segredos. Guardar segredos e material de rotação por canal separado; testar recuperação deles. Documentar roles e extensões necessárias, permissões do operador e compatibilidade de versões.
4. Fazer snapshot lógico consistente com ferramenta compatível e manifest de integridade. Monitorar sucesso, idade e falhas. Considerar WAL/PITR quando necessário ao RPO; isso não foi implementado nem contratado nesta versão.
5. Restaurar em **ambiente isolado novo**, sem clientes escrevendo e sem sobrescrever a fonte. Validar integridade/contagens/checksums, constraints, grants/RLS, auditoria e identidades/fatores; depois reconectar os serviços com configuração controlada e testar login, MFA, recuperação, todos os perfis, consultas e importação.
6. Em incidente, preservar evidências, congelar escrita conforme plano e avaliar divergências desde o backup. Após restauração, invalidar sessões/prévias conforme a natureza do incidente e efetuar rotação planejada. Não apagar secretamente históricos nem reimportar planilha para reconstruir movimentos inexistentes.
7. Obter aprovação formal antes de alternar clientes para a base recuperada; medir RTO real e perda efetiva versus RPO, com rollback e responsáveis de plantão. Repetir periodicamente e após alterações relevantes.

Supabase self-hosted não fornece automaticamente todos os recursos de backups/PITR gerenciados. Fontes oficiais consultadas: [self-hosting](https://supabase.com/docs/guides/self-hosting), [backups](https://supabase.com/docs/guides/platform/backups), [restauração para self-hosted e dados Auth](https://supabase.com/docs/guides/self-hosting/restore-from-platform). Nenhum banco remoto foi criado ou conectado no ensaio.
