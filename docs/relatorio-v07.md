# Resultado da validação v0.7

Execução final: `npm run verify:v07`, em 6 de novembro de 2026. Evidências sanitizadas em [evidencias-v07.json](evidencias-v07.json). O relatório técnico e a configuração estão em [autenticacao-local-v07.md](autenticacao-local-v07.md).

| Camada                | Resultado                                            |
| --------------------- | ---------------------------------------------------- |
| Testes automatizados  | 102 aprovados em 11 arquivos                         |
| PostgreSQL nativo     | 446 verificações aprovadas                           |
| Chromium demonstração | 72 testes aprovados, Vite/build e desktop/celular    |
| Integração HTTP v0.6  | 18 cenários preservados e reexecutados               |
| Chromium online real  | 18 testes, desktop/celular, com Auth/PostgREST reais |
| TypeScript e build    | Sem erros                                            |

Nenhuma migração/RLS, armazenamento local demonstrativo ou importação Excel foi alterada. A aplicação permanece em demonstração por padrão. O online exige configuração explícita de desenvolvimento e não é uma entrega para produção. Não houve publicação nem conexão ao Supabase remoto.

Também foram executados smoke Chromium no launcher manual (login, consulta, arquivos privados negados, logout/reload), rejeição de limpeza com manager ativo e encerramento explícito/idempotente após Ctrl+C no Windows. O ambiente foi encerrado sem deixar contêineres de teste ou lock. A sondagem transitória `lswt-*` do SDK não altera as chaves de dados existentes; sessões ficam em sessionStorage.

Arquivos principais adicionados: `code/ts/data/online-config.ts`, `code/ts/data/online.ts`, `code/ts/online-interface.ts`, `online-tests/` (fixtures confiáveis, testes, reporter e encerramento), `playwright.online.config.js`, dois arquivos de testes unitários e documentação/evidências v0.7. Alterados: bootstrap, estilos, rótulo de versão HTML, configuração Vite e `.env.example`, mensagens/comentários da fábrica demonstrativa, scripts de integração/checagem de portas, teste de isolamento, package/lockfile e README.

Limites: consulta online somente leitura; sem escrita/importação/administração online, recuperação de senha, SMTP, MFA, OAuth, BFF/HttpOnly ou implantação remota. Nenhuma pendência de execução das camadas locais listadas acima permanece. Isso não constitui validação de produção.
