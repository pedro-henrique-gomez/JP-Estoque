# JP Estoque v1.1 — entrega de movimentações e permissões

Base `088de04`. Validação local em 6 de novembro de 2026. Nenhum banco remoto, publicação, conta real ou dado corporativo. **Não aprovado para piloto ou produção**: permanecem os bloqueios da [v1.0](relatorio-v10.md).

## Resultado

Implementados menus separados de entrada, saída, histórico, usuários/permissões, cargos e relatórios. Movimentos usam identidade Auth real, horário do banco, quantidades exatas, saldo por contrato, transação atômica, confirmação e idempotência. Almoxarife autorizado registra saída diretamente. Comprovantes e estornos preservam o original e a auditoria.

Cargos personalizados e ajustes individuais permitem conceder, negar e restaurar herança sem alterar colegas. Os 13 nomes de capacidade são centralizados no TypeScript; PostgreSQL é a autoridade final. Teto do administrador, proteção do proprietário, proibição de autoadministração e vínculos por contrato são verificados no servidor. Há teste específico de contas inativas para impedir concessões latentes acima do gestor.

`npm run dev` continua abrindo a demonstração. Seus novos menus são informativos e não gravam movimentos. As funcionalidades operacionais são reais em `npm run dev:online`, com Supabase local descartável e usuários fictícios. Esse launcher não é um ambiente operacional persistente. Uso e detalhes: [movimentacoes-v11.md](movimentacoes-v11.md).

## Verificações executadas

| Comando/camada | Resultado |
| --- | --- |
| `npm test` | 185 testes em 18 arquivos; 165 anteriores e 20 novos |
| `npm run typecheck` | Sem erros |
| `npm run test:db` | 460 verificações PostgreSQL nativo aprovadas |
| `npm run test:browser` | 80 testes Chromium aprovados, Vite/build e desktop/celular |
| `npm run test:online` | 64 regressões aprovadas com Auth/PostgREST reais, inclusive importação |
| `npm run test:integration` | 18 cenários HTTP históricos aprovados, incluindo expiração natural de JWT |
| `npm run test:stock` | 29 cenários aprovados: 23 de backend real e seis Chromium desktop/celular |
| `npm run test:readiness` | 11 ensaios operacionais aprovados, incluindo backup/restauração com movimento |
| `npm run build` | TypeScript e Vite sem erros |
| `npm run audit:dependencies` | Zero advisories npm reportados; 190 entradas inventariadas, sem dependências novas |

A cadeia `test:all` terminou com código zero com 184 unitários; depois foi adicionado um teste de serialização do escopo de cargos e `npm test` passou com 185. O build foi executado novamente. Não somar as contagens como cenários independentes: existem repetições por plataforma/camada. Os relatórios históricos ainda carregam rótulos de versão v0.6/v0.9/v1.0 do harness; as execuções e hashes desta entrega estão consolidados em [evidencias-v11.json](evidencias-v11.json).

Serviços efetivos: PostgreSQL 17.11, GoTrue v2.197.0, PostgREST v16.5 e Kong 2.8.1. SQL nativo usa stub Auth exclusivamente de teste; suítes HTTP, online, operações e movimentos usam JWT legítimo emitido pelo GoTrue. Não foram falsificados JWTs para comprovar login real.

## Evidências dos cenários novos

- Entradas fracionárias e múltiplos recebimentos com a mesma referência de OC; saída pelo almoxarife sem aprovação; outro contrato permanece intacto.
- Zero, negativo, excesso de precisão, saldo insuficiente, campos obrigatórios ausentes e ator forjado recusados sem alteração.
- Duas confirmações simultâneas com a mesma chave produzem um único resultado; reutilização da chave com conteúdo diferente é recusada.
- Duas saídas concorrentes sobre o mesmo saldo: uma é confirmada e a outra recebe conflito `40001`, sem saldo negativo.
- Falha injetada na inserção do livro após a atualização do saldo: transação desfaz saldo e auditoria. O trigger de falha existe somente no laboratório descartável e é removido pelo teste.
- UPDATE/DELETE/INSERT diretos em movimentos e saldos pela API são negados inclusive a proprietário e administrador. Unidade do material com movimentos não pode ser trocada silenciosamente.
- Estorno compensatório, motivo, idempotência, preservação do original e recusa por permissão/saldo insuficiente.
- Cargo compartilhado, renomeação, negação individual sem afetar colega; teto de concessão inclusive em conta inativa; conta própria e proprietário protegidos.
- Capacidades de cargos, usuários e ajustes independentes; consulta de cargos sem expor diretório, vínculos ou auditoria de usuários.
- Entrada sem permissão de consulta geral funciona com contexto mínimo autorizado; negar estoque também oculta os saldos na projeção SQL existente.
- Revogação de contrato/permissão afeta o JWT já emitido; relatório exige capacidade de exportação no servidor e preserva escopo.
- Quantidade `999999999999999999.999999` chega ao comprovante e volta a zero sem perda de precisão.
- Chromium desktop/celular: entrada, saída, comprovante baixado e validado, histórico, relatórios com permissão independente, gerenciamento de cargo/ajuste, menus negados e limpeza no logout. Formulário sem transbordamento horizontal.

## Correções e compatibilidade

Durante os ensaios foram corrigidos conflito de alias SQL, grants antigos de UPDATE por coluna, teto de permissões que inicialmente ignorava usuários inativos e contexto de saldo para cargo somente de entrada. Foi acrescentada autorização explícita do endpoint de relatório. O bloqueio de unidade e os snapshots sob lock protegem o histórico de mudanças concorrentes do catálogo.

As regressões de navegador esperavam clicar em Administração sem autorização; agora verificam menu oculto e negação real da API. Uma primeira rodada teve quatro falhas por essa expectativa antiga; foi corrigida e a rodada completa seguinte passou 64/64. Ao ampliar o teste de relatórios independentes, outra rodada encontrou uma espera incorreta pelo formulário da página anterior; o teste passou a aguardar a navegação efetiva e a execução final passou 29/29. Os testes antigos que alteravam saldo diretamente foram adaptados para RPC de movimento. As verificações de constraints puras continuam em fixture SQL confiável, separadas da recusa da API. Não foram removidos cenários para obter aprovação.

As cinco migrações históricas não mudaram. A sexta migração é necessária para persistência, atomicidade, RLS e auditoria; revoga escrita direta em saldos, preservando a importação transacional como fotografia. Não houve conversão de saldos antigos em movimentos fictícios. Nenhuma escrita ou limpeza do localStorage do usuário foi executada. Os módulos dos importadores e o processo de RM/OC/compras não foram alterados.

## Arquivos modificados

- `supabase/migrations/20261106000600_stock_movements.sql`: cinco tabelas, RLS/grants, helpers, nove RPCs novas e limites das RPCs de usuários existentes.
- `code/ts/stock-permissions.ts`, `code/ts/data/stock.ts`, `code/ts/stock-interface.ts`: capacidades, decimais exatos, serviço RPC e interface operacional/administrativa.
- `code/ts/data/online.ts`, `code/ts/online-interface.ts`: integração e ciclo de sessão/revogação, sem substituir Auth.
- `code/ts/demo-movement-info.ts`, `code/js/script.js`, `code/html/index.html`, `code/css/styles.css`: menus informativos na demonstração, versão e apresentação.
- `tests/stock-permissions.test.js`, `tests/stock-service.test.js`, `stock-tests/run.mjs`: testes novos.
- `db-tests/run.mjs`, `integration-tests/{run,start-local,execute-local,http-cases}.mjs`, `online-tests/{auth,administration,import}.spec.js`, `readiness-tests/run.mjs`: regressões, isolamento e backup com o novo esquema.
- `package.json`, `package-lock.json`: versão e scripts; nenhuma dependência adicionada.
- `README.md`, `docs/movimentacoes-v11.md`, este relatório e `docs/evidencias-v11.json`: uso, limites e evidências sanitizadas.

## Limitações e pendências

1. Uso real compartilhado, infraestrutura persistente, implantação HTTPS, domínio/SMTP, UI de recuperação/MFA e exigência de AAL2 continuam pendentes. Não há produção nem Supabase remoto.
2. Os achados HIGH/CRITICAL de imagens Docker da v1.0 não foram remediados nesta evolução. O scan de imagens não foi reexecutado; o resultado anterior permanece um bloqueio conhecido, não uma aprovação atual. `verify:v11` inclui esse gate e não deve ser anunciado verde.
3. O mutex global serializa gravações entre contratos. Os ensaios de concorrência comprovam consistência local, não capacidade/SLA de carga corporativa. O teste operacional controlado observou espera de aproximadamente um segundo para escritor não relacionado enquanto leituras continuaram funcionando.
4. Restauração testada em nova base no mesmo laboratório: 48 tabelas, dados Auth, movimentos, auditoria, RLS, grants e constraints comparados. Não comprova recuperação do stack completo em outro host, SMTP, segredos externos, RPO/RTO ou rotação de chaves.
5. Comprovantes/relatórios são JSON paginado. Não há PDF fiscal, assinatura digital, envio externo ou exportação ilimitada.
6. Importações continuam fotografias auditadas separadamente; livro de movimentos não reconcilia sozinho fotografias e saldos legados. Não há inventário contábil, RM, OC, compras ou aprovação de recebimento.
7. Edição concorrente do CRUD legado continua uma pendência da v1.0. Superusuários e canais de provisionamento exigem controle operacional externo; RLS não protege contra administrador de infraestrutura confiável.
