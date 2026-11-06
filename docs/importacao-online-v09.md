# Importação online local v0.9

Base: `a13be86` (v0.8). A demonstração continua sendo o modo padrão. Esta versão usa somente Supabase local, dados fictícios e configuração explícita de desenvolvimento. Não é uma aplicação pronta para produção.

## Uso

Execute `npm ci`, confirme Docker Linux disponível e inicie `npm run dev:online`. O launcher cria um stack isolado, aplica as migrações e gera identidades fictícias pelo Auth. Consulte as credenciais somente no arquivo local ignorado informado pelo terminal. Abra a URL local fornecida. Entre como proprietário ou administrador e abra **Administração → Importação de saldos**.

1. Selecione um `.xlsx` fictício. A primeira linha da aba contém os cabeçalhos.
2. Escolha a aba, mapeie código, descrição, unidade e quantidade; os demais campos são opcionais.
3. Escolha um contrato de destino já cadastrado. Quando a coluna contrato estiver preenchida, deve corresponder ao destino. Para uma planilha com vários contratos, faça lotes separados, descartando explicitamente as linhas de outros contratos em cada lote.
4. Gere a prévia no servidor. Nenhum material, saldo ou lote é gravado nessa etapa.
5. Escolha explicitamente adicionar saldo novo, substituir a fotografia de saldo existente ou ignorar. Linhas inválidas exigem descarte explícito; ignorar não contorna erros. Códigos repetidos exigem descarte das linhas excedentes.
6. Gere novamente a prévia após qualquer ajuste e revise valores anteriores, propostos, avisos e conflitos. Abra a confirmação, marque a ciência dos valores absolutos e confirme.
7. Exporte o relatório JSON da prévia ou do resultado. Lotes confirmados também oferecem exportação na aba Histórico após recarregar a página.

O arquivo fica no navegador, em memória e worker descartável; o servidor recebe somente linhas estruturadas e metadados. Nenhuma planilha é enviada ao GitHub ou armazenada no banco. O SHA-256 do arquivo é rastreabilidade informada pelo cliente; não comprova a origem do arquivo e não é usado como autoridade de idempotência.

## Fotografia de saldos e integridade

Quantidades são valores absolutos, nunca incrementos ou movimentações. Um material ausente não é excluído nem zerado. O catálogo é global e o saldo tem chave produto/contrato. Produtos novos podem ser criados pelo lote; metadados de produtos existentes são preservados, com aviso de divergência. Unidade divergente é erro; não há conversão automática.

Contratos, fornecedores e localizações precisam existir; não são criados silenciosamente. Fornecedor é resolvido pelo nome e localização pelo código dentro do contrato de destino. Associações vazias preservam as existentes. Referências OC/NF preenchidas são acrescentadas sem repetir referências iguais; as anteriores permanecem. Essas referências não emitem documentos nem alteram processos de compras, recebimento ou aprovação.

Quantidades trafegam como texto e são convertidas no servidor para `numeric(24,6)`: até 18 dígitos inteiros e seis decimais, sem arredondamento silencioso. Negativos, notação exponencial, NaN, tipos não textuais e excesso de precisão são rejeitados. Para valores de alta precisão, as células Excel devem ser texto; números já arredondados pelo Excel não podem ser recuperados. Fórmulas, datas, booleanos e erros são linhas inválidas.

## Migração adicional e fronteira de segurança

`20261106000500_online_import.sql` é a quinta migração. As quatro históricas são preservadas. A v0.8 não tinha um mecanismo de confirmação atômica de fotografias: as duas novas RPCs são o mínimo necessário para essa fronteira de escrita.

- `admin_import_preview(request jsonb)`: verifica `auth.uid()` e perfil ativo no banco, resolve contratos/IDs/associações e valida novamente todo o conteúdo. Produz plano assinado HMAC-SHA256 por segredo privado, com ator, expiração de dez minutos, conteúdo e estado da base. Não persiste prévias.
- `admin_import_commit(preview_token text)`: valida ator, assinatura, validade, perfil ativo atual e estado da base. Resolve novamente o plano e grava produto/saldo/referências/lote/linhas/auditoria/recibo na mesma transação PostgreSQL. Uma exceção reverte tudo.
- As duas funções públicas são `SECURITY DEFINER`, com `search_path` vazio e referências qualificadas. Somente `authenticated` recebe EXECUTE; autenticação não implica autorização, verificada dentro das funções. Funções e tabelas privadas não são expostas ao navegador.
- As tabelas privadas de segredo e recibos têm FORCE RLS e nenhum grant de aplicação. As políticas históricas do negócio permanecem. Retirou-se o INSERT direto de `authenticated` em `import_batches`/`import_rows`, impedindo forjar logs ou lotes parciais. Esses registros agora são escritos somente pela transação RPC. Leitura continua sob RLS; histórico não pode ser editado pela aplicação.
- Um mutex administrativo e bloqueio da linha do ator ordenam revogações e confirmações. Bloqueios `SHARE ROW EXCLUSIVE` nas seis tabelas de negócio estabilizam a prévia e a confirmação frente a DML comum. Leituras continuam disponíveis. Timeout de bloqueio: três segundos.
- O estado inclui catálogo, contratos, fornecedores, localizações, saldos e referências. Qualquer mudança invalida conservadoramente a prévia, exigindo revisão. Não basta reusar um ID enviado pelo cliente.
- Idempotência usa impressão digital calculada no servidor sobre destino e linhas selecionadas normalizadas/ordenadas, independente do nome/hash do arquivo e da decisão add/replace. Repetição retorna o recibo original sem reaplicar. Confirmações simultâneas são serializadas. O mesmo token, inclusive após resposta de rede perdida, recupera o resultado enquanto válido; depois disso, consulte o Histórico.
- Reimportação de conteúdo já confirmado é somente consulta histórica, mesmo se o saldo tiver mudado depois. Para registrar uma nova fotografia idêntica seria necessária uma política futura explícita; não há botão de contorno nesta versão.

Não há chave `service_role`, senha de banco ou segredo HMAC no frontend. O harness Node usa administração confiável somente para identidades fictícias e injeção de falhas no banco descartável. Tokens legítimos são emitidos por GoTrue e enviados a PostgREST por HTTP real. Autoadministração e elevação de privilégios permanecem bloqueadas. LocalStorage e importador demonstrativo não são modificados.

## Limites e leitura defensiva

Padrões máximos: 2 MiB por arquivo, 500 linhas de dados por aba, 50 colunas, dez abas, 8 MiB descompactados, dois mil entradas ZIP e oito segundos no worker. `VITE_JP_IMPORT_MAX_BYTES`, `VITE_JP_IMPORT_MAX_ROWS` e `VITE_JP_IMPORT_MAX_COLUMNS` podem apenas reduzir os máximos. O servidor mantém teto independente de 500 linhas e 512 KiB de JSON; campos têm limites e whitelist. Um arquivo que excede qualquer teto é recusado integralmente.

O ZIP é inspecionado antes do SheetJS: diretório, contagens, tamanhos declarados/reais, CRC, razão de expansão, caminhos e conteúdo OOXML. Não são aceitos arquivos criptografados, ZIP64, macros, objetos incorporados, ActiveX, links externos, entidades/DTD ou arquivos disfarçados de `.xlsx`. Não há extração no filesystem. SheetJS CE 0.20.3 (Apache-2.0, pacote oficial) lê o workbook; fflate 0.8.3 (MIT) permite verificar a expansão real e o CRC em streaming. Licenças distribuídas em `public/licenses/`.

## Testes e limites conhecidos

`npm run verify:v09` executa testes unitários, TypeScript, PostgreSQL nativo, build, Chromium demonstrativo, cenários HTTP históricos e Chromium online. O teste nativo usa fixtures de Auth próprias e não constitui prova de autenticação. As suítes online usam GoTrue/PostgREST/JWT reais e banco descartável, sem importar o stub nativo no Supabase.

Os novos testes geram XLSX fictícios em memória. Não há planilha versionada. Injeção de falha em uma segunda linha e redução temporária da validade da prévia ocorrem somente no harness confiável e são removidas em `finally`; não há mecanismos de bypass na migração.

Limitações: lotes pequenos, um contrato por confirmação, cabeçalhos na primeira linha, relatório JSON, sem upload persistente, sem retomada de mapeamento após recarregar. Estado global e bloqueios conservadores são adequados somente ao experimento local, podendo exigir nova revisão para volume e concorrência maiores. Arquivos OOXML legados/exóticos podem ser recusados pelas regras defensivas. Não há antivírus, análise de arquivos no servidor ou preparação para dados corporativos reais. Antes de qualquer implantação, é necessária revisão independente, política de retenção, observabilidade, limites de tráfego e validação operacional. Nenhum serviço remoto foi conectado.

Resultados executados e evidências são publicados separadamente em `relatorio-v09.md` e `evidencias-v09.json` após a validação.
