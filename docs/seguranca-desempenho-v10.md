# Segurança e desempenho — v1.0

**Conclusão: laboratório validado; piloto NÃO aprovado.** Os riscos e gates abertos estão em [riscos-v10.md](riscos-v10.md) e [checklist-piloto-v10.md](checklist-piloto-v10.md). Nenhum teste local comprova prontidão de produção.

## Superfície revisada

Frontend: dados online são renderizados por `textContent`/`Option`; os `innerHTML` revisados são literais estáticos ou limites numéricos validados. No demo há escape de texto/atributos e IDs numéricos finitos antes dos handlers legados. Payload HTML persistido foi testado em Chromium online e no demo, sem executar nem criar a imagem maliciosa. Isso não substitui pentest independente. Sessão permanece em sessionStorage, acessível ao JavaScript; CSP e prevenção de XSS continuam essenciais.

Foi corrigida uma falha da exportação CSV: apenas aspas não neutralizavam fórmulas. `safeCsvCell` prefixa apóstrofo quando há =,+,-,@ após whitespace/controles, preservando quoting e valores salvos. Nenhuma transformação foi aplicada ao importador ou ao localStorage. Testes unitários e download real comprovam a representação segura e a base inalterada.

Vite/preview agora enviam no-referrer, nosniff, DENY e Permissions-Policy. A primeira abertura do Vite falhou por timeout em duas rodadas; traces mostraram CSS/env locais pendentes. A descoberta de dependências foi limitada ao HTML da aplicação e diretórios privados de ensaios/backups foram retirados do watcher. Na rodada final, a abertura inicial passou em menos de 1 s e os 80 casos passaram com o timeout de teste original. Não se atribui causa exclusiva ao hardware, nem se esconde a falha com retry/timeout maior. O harness operacional permite prazo separado de boot, sem usar isso como SLO da aplicação.

Auth/RLS/RPC: o frontend não atribui privilégios. `auth.uid()` e perfil ativo no banco são autoridade. Cadastro público é negado; identidade sem perfil fica sem acesso; metadata não confere perfil. RPCs usam search_path vazio, funções privadas sem EXECUTE de aplicação e validação de ator. Autoadministração e alteração direta de perfis/vínculos permanecem proibidas. As cinco migrações históricas não foram alteradas. As regressões verificam todos os perfis, grants/exposição, negações, revogação em sessão existente e expiração JWT natural.

Importação: assinatura server-side, precisão textual/numeric(24,6), limite de payload/linhas, resolução de IDs, confirmação explícita, locks e idempotência permanecem como na v0.9. Falha na segunda linha continua revertendo o lote e a auditoria. Não há movimento fictício, soma de saldos, zeramento por ausência, emissão de RM/OC ou mudança de compras/recebimento. Auditoria imutável contém dados completos e precisa de política de acesso/retention antes de dados reais.

## Dependências e licenças

`npm audit --json` e `npm run audit:dependencies` retornaram zero advisories conhecidos no escopo do registro npm, na data das evidências. Inventário: 190 entradas do lockfile, incluindo opcionais de outras plataformas; não significa 190 pacotes usados em produção. Metadados de licença: MIT, MIT-0, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, BlueOak-1.0.0 e CC0-1.0. Nenhuma atualização automática ou troca de biblioteca foi feita.

SheetJS CE continua 0.20.3, tarball oficial, Apache-2.0. Foram consultados advisories do fornecedor: [CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533), corrigido a partir de 0.19.3, e [CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363), corrigido a partir de 0.20.2. A versão instalada está acima desses limiares. Isso não é garantia de ausência de outras falhas; o tarball não deve ser considerado integralmente coberto pelo npm audit. fflate 0.8.3 permanece MIT e as licenças distribuídas foram preservadas.

Docker Scout v1.27.0 executou scans reais das quatro imagens públicas já locais, usando `local://` (sem pull, sem código da JP ou volumes do banco). Digests, IDs, versões afetadas e versões de correção declaradas pelo scanner estão em `imagens-v10.json`. Critérios de severidade são os do scanner, não uma conclusão independente de exploração.

| Imagem                 | Regras advisory/pacote | Crítica | Alta | Média | Baixa | Não especificada |
| ---------------------- | ---------------------- | ------- | ---- | ----- | ----- | ---------------- |
| PostgREST v16.5        | 0                      | 0       | 0    | 0     | 0     | 0                |
| GoTrue v2.197.0        | 43                     | 5       | 25   | 9     | 2     | 2                |
| Kong 2.8.1             | 58                     | 4       | 23   | 25    | 6     | 0                |
| PostgreSQL 17.11.0.011 | 6                      | 0       | 0    | 6     | 0     | 0                |

Há múltiplas ocorrências/pacotes por advisory, e IDs podem repetir entre imagens; não somar isso como vulnerabilidades independentes da aplicação. O primeiro scan indexou apenas um pacote no PostgREST, 176 no GoTrue, 89 no Kong e 267 no PostgreSQL. Zero achados no PostgREST, com essa cobertura, não comprova segurança de todos os binários/links estáticos. Não foram escaneados o host Windows nem os binários do PostgreSQL nativo de testes.

Exemplos críticos reportados: Kong/curl `CVE-2023-38545` e `CVE-2022-32221`; GoTrue/OpenSSL `CVE-2026-75803`, stdlib Go `CVE-2026-56857` e zlib `CVE-2026-4738`. São identificações do scanner, sem teste de exploração ou prova de alcançabilidade em cada uso. Algumas dependências podem ser ferramentas auxiliares; isso exige triagem técnica, não descarte presumido. A lista completa contém as faixas e correções informadas pelo scanner, inclusive casos sem correção declarada. Não se recomenda uma tag nova sem validar seu conteúdo e compatibilidade.

`npm run audit:images` grava relatório e bloqueia o gate ao encontrar HIGH/CRITICAL ou scan incompleto. Nesta entrega o comando retornou não zero por achados; isso é uma **reprovação de segurança**, não erro ocultado nem teste funcional aprovado. `npm run verify:v10` deve continuar não verde até remediação/triagem comprovada. Não foram atualizadas imagens da stack aprovada, suprimidos achados ou enfraquecidos controles para obter aprovação. `npm run audit:dependencies` também distribui notices/copyrights das 11 dependências runtime instaladas em `public/licenses/THIRD-PARTY-v10.txt`; nenhuma ficou sem notice nesta rodada. Aceite jurídico e obrigações de binários/distribuições continuam pendentes.

## Formatos e reimportação

Três XLSX fictícios em memória exercitam colunas em ordens diferentes, SKU com zeros à esquerda, saldo zero e vírgula decimal textual. O parser de produção lê os arquivos, os campos são mapeados e enviados às RPCs reais, e os saldos são conferidos na projeção textual. Unidade `UND` e quantidade com separador de milhar `1.234,56` são recusadas; não há conversão silenciosa. Cabeçalho fora da primeira linha, dicionário de unidades e formatos efetivos da JP exigem homologação; nenhuma planilha verdadeira foi usada.

Reimportação periódica foi exercitada com JWT legítimo: primeiro saldo 1.250001, depois fotografia 2.250001, depois o conteúdo original. O servidor devolve o primeiro recibo e preserva 2.250001. É a proteção aprovada da v0.9, não uma nova fotografia de outro período. JP precisa decidir a semântica de ciclos antes do piloto. Hash/nonce fornecido pelo cliente não será usado para contornar idempotência.

## Medições locais

Uma execução por tamanho, sem teste de estresse ou distribuição estatística representativa. XLSX de 10/100/500 linhas foram gerados, lidos pelo parser de produção em Node e importados por HTTP real. Cinco leituras autorizadas foram disparadas junto com cada confirmação. O tempo do parser **não** é uma medição de worker/UI em dispositivo corporativo. Base pequena e crescente de dados fictícios; sem carga real da JP.

| Linhas | XLSX (bytes) | Parser Node (ms) | Prévia HTTP (ms) | Commit HTTP (ms) | Leituras concorrentes (ms) |
| ------ | ------------ | ---------------- | ---------------- | ---------------- | -------------------------- |
| 10     | 9238         | 4                | 8                | 25               | 5–27                       |
| 100    | 14609        | 11               | 96               | 157              | 6–18                       |
| 500    | 41316        | 26               | 928              | 1173             | 8–9                        |

Os valores pertencem à rodada registrada em `evidencias-v10.json`; não são um SLA. Tetos operacionais atuais permanecem: 2 MiB, 500 linhas, 50 colunas, dez abas, 8 MiB expandidos, oito segundos de worker e 512 KiB estruturados, com possibilidade de reduzir limites.

Com bloqueio global equivalente ao da importação mantido por 1000 ms, SELECT terminou em 4 ms e um escritor de catálogo não relacionado aguardou 1016 ms. Portanto leituras continuam, mas escritas entre contratos interferem. Timeout de lock de três segundos e mutex administrativo também afetam provisionamento/revogação concorrentes até a transação anterior terminar. O planejamento percorre linhas para duplicidades e calcula hash global da base; não há garantia de escala para grandes volumes. CRUD comum ainda precisa de controle otimista para múltiplos editores.

Possíveis melhorias, não implementadas nem presumidas seguras: versões por contrato/produto, locks mais granulares com ordem fixa, fila de importação, controle otimista do CRUD, planejamento de lotes assíncronos e medição com dados sintéticos representativos. Não retirar locks nem aceitar prévia obsoleta para ganhar desempenho. Quantidade/concorrência/SLO e janela de operação precisam ser definidos pela JP.

## Recuperação e limites do resultado

Dump cifrado e restore real em base nova do mesmo cluster: 43 tabelas, constraints, funções, grants, flags/políticas RLS, dados Auth e chave privada comparados. Aproximadamente 579 KB, dump 276 ms e restore/validação 1350 ms nesta rodada. Chave errada e ciphertext alterado foram negados. A fonte não foi sobrescrita. [Procedimento e lacunas](backup-restauracao-v10.md).

Não foram testados SMTP/domínio/HTTPS corporativos, UI de confirmação/recovery/MFA, enforcement AAL2, remediação/triagem dos achados de imagens, scan do host/binários nativos, observabilidade de ambiente publicado, restauração em outro host com reconexão Auth/PostgREST/UI, custódia durável de segredos, RPO/RTO ou carga real. O build online continua deliberadamente proibido. Nenhum desses itens recebe aprovação por inferência.
