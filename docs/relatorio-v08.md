# Resultado da validação v0.8

Base: `4019ec4`. Execução: `npm run verify:v08`, em 6 de novembro de 2026. Evidências sanitizadas: [evidencias-v08.json](evidencias-v08.json). Configuração, mecanismos e matriz por perfil: [administracao-local-v08.md](administracao-local-v08.md).

| Camada                | Resultado                                                           |
| --------------------- | ------------------------------------------------------------------- |
| Testes automatizados  | 125 aprovados em 12 arquivos; 102 anteriores e 23 novos             |
| PostgreSQL nativo     | 446 verificações aprovadas                                          |
| Chromium demonstração | 72 aprovados em Vite/build, desktop/celular                         |
| HTTP integrado v0.6   | 18 cenários reexecutados                                            |
| Chromium online       | 44 resultados: 18 fluxos v0.7 e 26 resultados administrativos novos |
| TypeScript e build    | Sem erros                                                           |

Não foram modificadas migrações, políticas RLS, importação Excel ou armazenamento demonstrativo. Não há produção ou conexão remota. As evidências históricas da v0.7 foram preservadas.

Arquivos novos: adaptador `code/ts/data/online-administration.ts`, erro compartilhado `online-error.ts`, componente `code/ts/online-admin-interface.ts`, testes `tests/online-administration.test.js`, `online-tests/administration.spec.js` e documentos/evidências v0.8. Integrações alteradas: backend/componente online, estilos e rótulo de versão, fixtures/reporter/runner online, expectativa do cenário de proprietário, package/lockfile e README.

Escritas aprovadas usam somente RLS e as duas RPCs existentes. Não foi encontrada lacuna nas operações necessárias que justificasse SQL novo. Restrições de autoadministração, FK e auditoria imutável foram verificadas por HTTP real, com saldos intactos após CRUD. Nenhum segredo, senha ou workbook faz parte das evidências versionadas.
