# Relatório JP Estoque v0.9

Base: `a13be86` (v0.8). Validação concluída em 6 de novembro de 2026. Comandos executados separadamente, todos com saída final zero: `npm run test:all`, `npm run test:online` e `npm run test:integration`. Evidências sanitizadas: [evidencias-v09.json](evidencias-v09.json). Fluxo, arquitetura e limites: [importacao-online-v09.md](importacao-online-v09.md).

| Camada | Resultado final executado |
| --- | --- |
| Vitest | 148 aprovados em 13 arquivos: 125 anteriores e 23 novos |
| PostgreSQL nativo | 460 verificações: 446 anteriores, com expectativa de INSERT direto de logs ajustada à nova restrição, e 14 novas |
| Chromium demonstração | 72 aprovados em Vite/build, desktop/celular |
| Playwright online com Auth/PostgREST reais | 64 resultados: 44 regressões e 20 novos, sem ignorados |
| Novos resultados de importação | Dez cenários repetidos em desktop/celular: oito execuções UI e 12 exclusivamente HTTP |
| Regressão HTTP v0.6 | 18 cenários aprovados, incluindo expiração natural de JWT legítimo |
| TypeScript e build | Sem erros |

Não se somam esses números como cenários independentes de negócio: há repetições por plataforma e camadas. PostgreSQL nativo usa fixtures próprias de Auth; sua contagem não é evidência de GoTrue. Autenticação real foi exercitada nas suítes online e HTTP.

## Resultado funcional e de segurança

A importação `.xlsx` tem seleção de aba, mapeamento, destino obrigatório, decisões explícitas por linha, descarte de inválidas, prévia validada no servidor, confirmação administrativa, recibo e exportação JSON. Relatórios persistidos são recuperáveis na aba Histórico. Catálogo global e saldos por contrato continuam separados; o lote representa fotografia absoluta, sem movimentos, somas automáticas, exclusões ou zeramento por ausência.

Uma quinta migração introduz duas RPCs e duas tabelas privadas para assinatura e idempotência. As quatro migrações históricas permanecem byte a byte inalteradas no Git. O único endurecimento de grants retira INSERT direto de `authenticated` nos logs de importação, exigindo a transação RPC. Nenhuma política RLS de negócio foi enfraquecida.

Foi comprovado por HTTP real:

- Proprietário e administrador ativos importam; funcionário, almoxarife, coordenador, planejamento, diretor, inativo e usuário sem contrato não conseguem chamar as RPCs com sucesso.
- Tokens emitidos por GoTrue não permitem contornar o perfil atual do banco. Trocar o ator da prévia ou adulterar sua assinatura é negado. Expiração da prévia e revogação de perfil afetam sessões legítimas existentes.
- Quantidade `999999999999999999.999999` permanece exata no banco, na projeção textual e nos relatórios. Quantidades negativas, excesso de casas, notação exponencial, NaN, tipos incorretos, contratos divergentes e associações inexistentes são recusados.
- Uma confirmação simultânea do mesmo token produz um único lote. Repetir o token ou reenviar o mesmo conteúdo com outro hash informado pelo cliente retorna o recibo original sem reaplicar.
- Uma falha injetada na segunda linha reverte produtos, saldos, lote, linhas, auditoria e recibo. A injeção existe somente no teste confiável, com remoção em `finally`.
- Uma edição concorrente entre prévia e confirmação causa `40001`, preservando o valor concorrente. Uma nova prévia apresenta o valor atual antes da substituição explícita. Bloqueio concorrente prolongado causa `55P03`, sem gravação parcial.
- Materiais ausentes mantêm seus saldos; referências OC/NF são associadas ao destino correto, sem emissão de documentos. Consultas de contrato não autorizado retornam vazio.
- Chave privada e funções auxiliares não estão expostas pela API. Lotes e linhas não podem ser forjados por INSERT direto, mesmo por administradores. Histórico continua imutável e relatórios seguem RLS.

## Falhas encontradas e corrigidas

A validação nativa detectou ambiguidade de variável SQL no acesso ao recibo; foram usados nomes/aliases inequívocos. Nos testes de leitura, a entrada `ArrayBuffer` de outro contexto confundia o reconhecimento do SheetJS; a entrada foi padronizada para `Uint8Array`. A detecção de macros foi ajustada para não rejeitar o tipo `.bin` padrão de um XLSX normal, preservando o bloqueio de macros reais.

Na primeira rodada integrada, Chromium identificou uma opção HTML malformada no seletor de novos saldos; ela foi corrigida. O teste do histórico ainda buscava um atributo anterior; o seletor foi corrigido para o cartão do lote persistido. A rodada final integral aprovou todos os 64 resultados online, sem retries ou testes ignorados.

## Serviços efetivos

Docker Engine 29.9.2; Supabase CLI 3.0.0; PostgreSQL 17.11 (`17.11.0.011`); GoTrue `v2.197.0`; PostgREST `v16.5`; Kong `2.8.1`. Stack isolado e descartável, sem conexão remota. O launcher encerrou somente seus próprios serviços e preservou backups locais ignorados pelo Git. Nenhuma chave, senha, JWT ou prévia assinada integra as evidências versionadas.

## Arquivos e preservação

Novos componentes/serviços: `code/ts/online-import-interface.ts`, `online-import-types.ts`, `online-import-report.ts`, `online-xlsx-parser.ts`, `online-xlsx-reader.ts`, `online-xlsx-worker.ts` e `code/ts/data/online-import.ts`. Integração do painel em `code/ts/online-admin-interface.ts` e `code/ts/data/online-administration.ts`. Rótulos v0.9 em `code/html/index.html` e `code/ts/online-interface.ts`.

Banco: `supabase/migrations/20261106000500_online_import.sql`, `db-tests/import-checks.mjs` e integração em `db-tests/run.mjs`. Testes: `tests/online-import.test.js`, `online-tests/import.spec.js`, `playwright.online.config.js`; ajustes de exposição das novas RPCs, número de migrações, classificação/redação de evidências e contagem em `integration-tests/http-cases.mjs`, `integration-tests/preflight.mjs`, `online-tests/environment.mjs`, `online-tests/auth.spec.js`, `online-tests/reporter.mjs` e `online-tests/run.mjs`.

Dependência fflate 0.8.3, MIT, com licença em `public/licenses/fflate-MIT.txt`; SheetJS CE 0.20.3 Apache-2.0 permanece. Metadados/scripts em `package.json`/`package-lock.json`, limites opcionais em `.env.example`, README e três documentos v0.9. Nenhuma planilha foi versionada.

LocalStorage, importador demonstrativo em `code/js`, permissões centrais, migrações históricas, documentos/evidências aprovados da v0.8 e processos de RM, OC, compras e recebimento foram preservados. Nenhum usuário real foi criado e não houve publicação da aplicação.

## Limitações e pendências

Não há teste bloqueado no escopo local solicitado. Permanecem limites intencionais: um contrato por lote; fornecedores/localizações/contratos previamente cadastrados; primeira linha como cabeçalho; máximo de 2 MiB/500 linhas/50 colunas/dez abas e 512 KiB estruturados; exportação JSON; sem persistência do arquivo ou mapeamento.

A impressão de estado é global e usa bloqueios conservadores, sem teste de carga ou garantia para grandes bases. Conteúdo já confirmado não pode ser reaplicado como uma nova fotografia idêntica; retorna o histórico para evitar duplicação e regressão de saldos. Não há antivírus nem serviço de processamento de arquivos no servidor. Essas decisões exigem nova revisão antes de qualquer implantação. A versão continua experimental, exclusivamente local e **não está pronta para produção**.
