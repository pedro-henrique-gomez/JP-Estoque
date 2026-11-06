# JP Estoque v0.3 — correção da inicialização

## Diagnóstico e evidências

O usuário informou o endereço `http://localhost:5173/code/html/index.html`, sem erro vermelho no console. Em Chromium isolado sem dados salvos, a versão anterior carregava 9 usuários e 2 materiais do Contrato A. A hipótese inicial de servidor estático foi descartada para esse endereço. O perfil pessoal do usuário não foi acessado ou alterado.

Para reproduzir, uma cópia isolada do commit anterior, `315036f`, recebeu apenas dados fictícios: um snapshot com 1 material válido sem campo `updated`, e usuários/contratos com IDs personalizados. Comparação no Chromium real:

| Evidência                              | Antes                | Depois                           |
| -------------------------------------- | -------------------- | -------------------------------- |
| Materiais realmente salvos             | 1                    | 1                                |
| Valor selecionado no simulador         | Vazio                | usuario-existente                |
| Materiais exibidos                     | 0                    | 1                                |
| Contratos exibidos                     | 0                    | 1                                |
| Data exibida                           | Dados demonstrativos | Data não informada na base salva |
| Bytes do snapshot original preservados | Sim                  | Sim                              |
| Exceções de execução                   | Nenhuma              | Nenhuma                          |

A base não estava vazia: os registros eram ocultados pelo carregamento incorreto. O caso confirma o defeito da versão anterior, mas não prova que o perfil pessoal tinha exatamente esse formato, pois seu armazenamento não foi coletado.

## Causas e correções

1. `demoStorage.load` exigia `updated` como string. Materiais válidos sem essa propriedade eram trocados por fixtures em memória. Com contratos personalizados, essas fixtures não tinham vínculos reconhecidos e a consulta ficava vazia. Agora os registros são mantidos e a data ausente é indicada; datas legadas v0.1 são reaproveitadas quando disponíveis.
2. O seletor tentava manter o ID fictício inicial mesmo quando ele não existia na lista salva. O usuário interno recaía no primeiro salvo, mas o HTML continuava sem seleção. Agora o elemento e o usuário interno usam um ID efetivamente disponível.
3. Armazenamento incompatível era tratado como base inexistente, com fallback silencioso e risco de sobrescrita posterior. A leitura agora distingue ausência, vazio, compatível, incompatível e indisponível. JSON inválido, relatórios inválidos e versões futuras ficam preservados; gravações da base incompatível são bloqueadas.
4. Ausência de usuários não tinha tratamento explícito. Agora não causa exceção nem libera permissões. A página informa ausência de usuários, contratos, materiais, acesso por perfil ou resultados da pesquisa separadamente.

Abrir/recarregar não grava nem limpa chaves. Base de materiais vazia oferece carga fictícia explícita com confirmação; cadastros existentes não são substituídos e materiais não são duplicados. Proprietário/Administrador continuam necessários, salvo o bootstrap explícito de uma base administrativa totalmente vazia, sem usuários/contratos a substituir. Falhas de inicialização e JavaScript desativado recebem avisos. Importação e administração são preservadas; nenhum Supabase, RM, OC, compras ou recebimento foi implementado ou alterado.

## Validação final

| Verificação            | Resultado                                                |
| ---------------------- | -------------------------------------------------------- |
| `npm test`             | 65 testes aprovados, 6 arquivos; inclui os 57 existentes |
| `npm run typecheck`    | Sem erros                                                |
| `npm run build`        | Sucesso, 21 módulos                                      |
| Chromium real no Vite  | 13 testes aprovados                                      |
| Chromium real no build | 13 testes aprovados                                      |
| Total                  | 91 aprovados, nenhum reprovado                           |

Chrome for Testing 158.0.8127.18 gerenciado pelo Playwright, em modo headless e perfis isolados. Todos os testes verificam ausência de `pageerror` e console do tipo `error`. O terminal emitiu apenas aviso de cores `NO_COLOR`/`FORCE_COLOR`, sem afetar o resultado.

Os 13 cenários, repetidos nas duas modalidades: armazenamento vazio; carga explícita/seleção/filtros/pesquisa; perfil inativo; cadastros e IDs personalizados após reload; base legada; snapshot sem data; ausência de usuários com materiais existentes; ausência de contratos; administração incompatível; JSON inválido; versão futura; base administrativa vazia; cadastro e administração persistentes. Preservação é conferida comparando o texto original das chaves.

```sh
npm ci
npx playwright install chromium
npm test
npm run typecheck
npm run test:browser
```

`test:browser` recompila e inicia servidores isolados nas portas 5180/5181. Relatório local: `test-results/browser-results.json`. Artefatos de navegador, cópia de diagnóstico e planilhas são ignorados pelo Git.

## Arquivos alterados

- Leitura/estado: `code/ts/local-state.ts`, `demo-storage.ts`, `demo-admin-storage.ts`, `types.ts`.
- Seleção/serviços: `code/ts/demo-access.ts`, `demo-data.ts`, `demo-administration.ts`, `admin-interface.ts`, `import-service.ts`, `import-types.ts`.
- Inicialização/interface: `code/js/bootstrap.js`, `code/js/script.js`, `code/html/index.html`, `code/css/styles.css`.
- Testes/configuração: `tests/storage.test.js`, `tests/interface.test.js`, `e2e/app.spec.js`, `playwright.config.js`, `package.json`, `package-lock.json`, `.gitignore`.
- Documentação: `README.md`, `docs/importacao-v03.md`, `docs/arquitetura.md` e este relatório.

## Limitações

O perfil pessoal não foi extraído; a evidência antes/depois é uma reprodução fictícia. JSON corrompido e esquemas futuros exigem análise específica antes de conversão; a aplicação os preserva sem recuperação automática. As bases são por origem: `localhost`, `127.0.0.1` e portas diferentes não compartilham localStorage; não há transferência automática entre origens. O sistema permanece local e permissões no frontend não são segurança de backend.
