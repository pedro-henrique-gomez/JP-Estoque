# JP Estoque v1.0 — relatório de preparação

**Status: NÃO APROVADO PARA PILOTO.** Base `790251b`, validações locais em 6 de novembro de 2026. Não houve publicação, projeto Supabase remoto, contas reais ou dados corporativos. O modo demonstração continua padrão. A entrega prepara diagnóstico, controles e operação; não declara produção nem encerra os gates de piloto.

## Resultado executivo

As regressões funcionais finais passaram. O gate de segurança de imagens **foi reprovado**: Docker Scout apontou cinco achados críticos/25 altos no GoTrue e quatro críticos/23 altos no Kong; PostgreSQL teve seis médios. São severidades do scanner em dependências de imagem, sem comprovação de exploração ou alcançabilidade individual. Exigem triagem/remediação e nova validação; não foram suprimidas nem resolvidas trocando tags sem compatibilidade comprovada.

Além disso, faltam MFA obrigatório no banco/interface, fluxo de confirmação/recovery na UI, artefato online sem Vite DEV, HTTPS e DR completo, proteção de edição simultânea do CRUD e decisões corporativas. Algumas são **implementações técnicas pendentes**, outras dependem de SMTP/domínio/infraestrutura/autorização JP; não se atribui tudo a dependências externas.

## Verificações executadas

| Camada / comando             | Resultado final                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm test`                   | 165 testes em 16 arquivos: 148 anteriores e 17 novos                                                    |
| `npm run test:db`            | 460 verificações PostgreSQL nativo aprovadas                                                            |
| `npm run test:browser`       | 80 Chromium aprovados: 72 anteriores e oito novos em Vite/build, desktop/celular                        |
| `npm run test:online`        | 64 resultados anteriores aprovados com Auth/PostgREST reais; a suíte inclui testes UI e HTTP-only       |
| `npm run test:integration`   | 18 cenários HTTP históricos aprovados, inclusive expiração natural de JWT legítimo                      |
| `npm run test:readiness`     | 11 cenários operacionais adicionais aprovados, incluindo Chromium online/XSS e pg_dump/pg_restore reais |
| TypeScript / build           | Sem erros; `npm run test:all` também terminou com saída zero na rodada final                            |
| `npm run audit:dependencies` | Zero advisories reportados no escopo npm; 190 entradas inventariadas; notices runtime distribuídos      |
| `npm run audit:images`       | Quatro imagens locais analisadas; **retorno não zero por HIGH/CRITICAL, gate bloqueado**                |

A cadeia `test:all` passou após o ajuste do Vite, com 162 unitários naquele momento; o classificador do scanner foi adicionado depois e `npm test` passou novamente com 165. Esse módulo Node não altera o frontend ou o banco. Não somar essas contagens como cenários independentes: há repetição por camada/plataforma. O PostgreSQL nativo usa fixture Auth própria, não GoTrue. Os testes HTTP/online/operacionais usam JWT legítimo emitido pelo Auth; claims SQL foram usados somente para verificar RLS na base restaurada. Os tempos de laboratório não são um SLA.

`npm run verify:v10` reúne a cadeia completa e deve terminar **não verde** no gate de imagens enquanto os achados altos/críticos estiverem abertos. Não se apresenta esse comando como aprovado. Evidências: [evidencias-v10.json](evidencias-v10.json), [imagens-v10.json](imagens-v10.json) e [dependencias-v10.json](dependencias-v10.json).

## O que foi comprovado nos novos ensaios

- Cadastro público negado sem criar conta; convite por canal Auth Admin confiável confirma email e não concede perfil; identidade sem perfil não chama RPC administrativa.
- Com confirmação habilitada somente no laboratório descartável, email não confirmado não entra. Recovery legítimo é de uso único, muda senha e invalida a senha antiga. Nenhum email real foi enviado.
- TOTP real: inscrição, rejeição de código inválido, challenge/verify e sessão AAL2. Isso não implementa as telas MFA nem exige AAL2 na RLS atual.
- Três formatos XLSX fictícios foram lidos pelo parser de produção, mapeados e importados pelas RPCs reais. Zeros de código, saldo zero e vírgula decimal textual permanecem corretos. Unidade/quantidade não canônicas são recusadas.
- Planilhas de 10/100/500 linhas foram geradas em memória e importadas; cinco leituras concorrentes tiveram sucesso durante cada confirmação. Para 500 linhas: parser Node 26 ms, prévia HTTP 928 ms e commit 1173 ms nesta rodada.
- Bloqueio global controlado de 1000 ms permitiu SELECT em 4 ms, mas atrasou escritor de catálogo de outro contrato em 1016 ms. O isolamento tem custo global; a carga/SLO JP ainda precisa ser definida.
- Fotografia periódica idêntica recupera o recibo original e não reverte saldo intermediário. A política de ciclos precisa de decisão da JP, não bypass de idempotência no cliente.
- Payload HTML persistido foi apresentado como texto em Chromium online; no demo também não executa. CSV potencialmente interpretado como fórmula foi neutralizado somente na exportação, com dados salvos intactos.
- Dump completo cifrado por AES-GCM e restore em **base nova** compararam 43 tabelas de Auth/negócio/privado/migrações, constraints, funções, grants e RLS. A chave de assinatura foi preservada e leitor continuou restrito. Chave errada/ciphertext alterado falharam. A fonte não foi sobrescrita.

O restore ocorreu no mesmo cluster/host; não houve reconexão GoTrue/PostgREST/UI à base restaurada nem custódia durável de chave. Essas lacunas impedem chamar o ensaio de DR operacional completo.

## Correções e falhas durante a validação

A revisão encontrou formula injection na exportação CSV demonstrativa, corrigida com prefixo de apóstrofo para células iniciadas por =,+,-,@ após whitespace/controles. Somente a representação baixada muda. Foram adicionados headers locais de no-referrer, nosniff, DENY e Permissions-Policy.

As primeiras rodadas tiveram timeout na abertura fria do Vite; o trace mostrava CSS/env locais pendentes. A varredura de dependências foi limitada à entrada HTML e diretórios de backup/testes foram excluídos do watcher. A rodada final passou sem retry e com timeout original dos testes; a abertura inicial ficou abaixo de um segundo. Não foi removida asserção para obter sucesso.

O harness de backup inicialmente presumiu o project ID completo no nome do contêiner; a CLI o trunca. Corrigiu-se a identificação por rede/porta do stack isolado. O primeiro restore com papel `postgres` falhou; o ensaio final usa o papel interno confiável `supabase_admin` e passou nas comparações. Falhas não foram contadas como aprovações. Nenhum papel privilegiado foi disponibilizado ao browser.

## Entregáveis e arquivos

- [Matriz de riscos](riscos-v10.md): severidade, evidência, mitigação e estado, incluindo achados críticos de imagem.
- [Segurança/desempenho](seguranca-desempenho-v10.md): revisão frontend/Auth/RLS/RPC/importação, licenças, CVEs, limites e medições.
- [Checklist de piloto](checklist-piloto-v10.md), [operação](operacao-v10.md), [backup/restauração](backup-restauracao-v10.md) e [decisões JP](pendencias-jp-v10.md).
- `readiness-tests/run.mjs` e modo `--readiness` no launcher isolado; confirmação de email/TOTP habilitadas somente na cópia temporária do config.
- `scripts/operations/`: criptografia do ensaio, eventos com allowlist, inventário npm/notices, scan de imagens e classificação do gate.
- `code/ts/csv-export.ts` e integração mínima em `code/js/script.js`; testes `tests/operations.test.js`, `tests/csv-export.test.js`, `tests/image-report.test.js`, `e2e/security.spec.js`.
- `vite.config.js` com headers/varredura limitada; rótulos v1.0 em HTML/interface online; scripts e versão em package/lockfile; README e notices em `public/licenses/THIRD-PARTY-v10.txt`.

As cinco migrações, as políticas/RPCs aprovadas, os módulos de importação demonstrativa/online, persistência local e evidências históricas foram preservados. O único ajuste funcional no demo é o escape da exportação CSV; não limpa, migra ou sobrescreve localStorage. RM/OC/compras/recebimento e movimentações não foram implementados ou alterados.

## Próximos gates

1. Triar/remediar achados de imagens com versões/digests compatíveis, scan completo/revisão independente e reexecução das regressões. Não aceitar o npm zero como aprovação da stack.
2. Implementar MFA obrigatório em banco/UI, confirmação/recovery na UI, proteção de edição concorrente e artefato online seguro; nenhuma dessas funcionalidades está pronta por existir uma documentação.
3. JP definir participantes/contratos, política de fotografias periódicas, carga/SLO, unidades/formatos e governança de acessos/dados.
4. Autorizar infraestrutura/domínio/SMTP/secret manager e executar HTTPS, entrega de email, monitoramento, backup fora do host e restore completo com RPO/RTO aprovados.
5. Homologar operação, treinamento e resposta a incidentes e assinar o checklist. Até lá, **piloto bloqueado, sem dados reais e sem publicação**.
