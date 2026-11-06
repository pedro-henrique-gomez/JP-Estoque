# Movimentações e permissões v1.1

## Uso local

Base: commit `088de04`. Permanecem o HTML `/code/html/index.html`, CSS, logo, consulta, administração e importadores existentes. Esta evolução implementa as movimentações explicitamente solicitadas; não implementa o fluxo de compras da JP.

- `npm run dev`: demonstração anterior, dados locais preservados. Novos menus mostram informações e campos desabilitados, sem movimentações simuladas ou autenticação falsa.
- `npm run dev:online`: launcher existente inicia Supabase local isolado, aplica migrações e prepara usuários fictícios. Acesse a URL e o arquivo local de credenciais indicados no terminal. Docker Linux e portas livres são necessários. Nunca exponha esse Vite de desenvolvimento na rede pública.
- Após Ctrl+C no Windows, `npm run dev:online:stop` confirma a limpeza somente do ambiente descartável. Esse launcher não é um banco operacional durável e não deve receber dados reais.
- Não executar reset ou aplicar automaticamente migrações sobre bancos existentes. Para base local persistente, faça backup e revisão por responsável técnico antes de aplicar somente a nova migração, na ordem histórica, e revalidar o schema PostgREST. A aplicação informa explicitamente a ausência do módulo quando a RPC não existe.

Não há implantação online, migração do localStorage, cadastro público ou provisionamento Auth pelo navegador. Usuários Auth devem continuar sendo provisionados por canal confiável; a tela gerencia os perfis já existentes.

## Interface

Os grupos Consultas, Movimentações e Administração reutilizam a identidade visual preta, branca e cinza. Menus operacionais são exibidos conforme as capacidades devolvidas pelo servidor.

Entrada exige contrato, material e quantidade positiva; código, unidade, responsável e horário vêm do catálogo/Auth/servidor. Fornecedor, OC, NF e observações são referências opcionais. A mesma OC aceita entradas parciais. Não se cria nem aprova OC.

Saída exige contrato, material, quantidade, destino, nome do retirante e empresa. O almoxarife autorizado confirma diretamente, sem fila de aprovação administrativa. A revisão mostra saldo anterior e proposto. O servidor volta a validar tudo na confirmação.

O comprovante apresenta identificação, quantidades, contrato, material, responsável, retirante, destino, data e demais referências. O download é JSON autorizado novamente no servidor; não é documento fiscal ou assinatura digital. Quem pode ler um dado pode copiá-lo: a capacidade de exportação controla o endpoint de relatório, não constitui DRM.

Histórico permite contrato, período, tipo, material e funcionário, com páginas de 100 registros. As listas auxiliares só derivam de movimentos visíveis e são limitadas a 500 opções. Relatórios exportam a página filtrada, não toda a base automaticamente. Revogação/logout remove os dados protegidos da interface; o servidor revalida todas as chamadas. A atualização visual periódica continua em 30 segundos e ao recuperar foco.

Estorno exige permissão, motivo e confirmação. Cria um movimento oposto vinculado ao original; não o exclui ou edita. Uma entrada só pode ser estornada se houver saldo suficiente. Um movimento não pode ser estornado duas vezes nem se pode estornar um estorno. O comprovante original passa a exibir a referência do estorno.

## Persistência e integridade

A sexta migração adiciona `stock_roles`, `stock_role_permissions`, `stock_user_roles`, `stock_user_permissions` e `stock_movements`. Os sete cargos de sistema recebem padrões; nenhum usuário real, movimento inicial ou saldo é criado pela migração. Os cinco arquivos SQL históricos permanecem inalterados.

As quantidades são `numeric(24,6)`: até 18 dígitos inteiros e seis decimais. O formulário aceita vírgula e normaliza texto decimal; API exige texto canônico positivo. Cálculos de prévia usam BigInt e a API retorna quantidades em texto, evitando perda por Number. Excesso de precisão é recusado, não arredondado silenciosamente.

`stock_post` bloqueia e verifica o saldo esperado, atualiza somente o contrato selecionado, grava movimento, auditoria e referências na mesma transação. Falha em qualquer etapa desfaz tudo. Produtos e contratos são bloqueados para preservar as informações capturadas no comprovante. Unidade de produto com movimentos não pode ser alterada.

A chave UUID por usuário torna a confirmação idempotente: mesma chave e conteúdo retornam o resultado anterior, conteúdo diferente é recusado. O formulário conserva a requisição diante de falha incerta; não há repetição automática de escrita. Alterar o formulário gera nova operação e exige nova revisão. Consulte o histórico antes de iniciar outra operação após falha de conexão.

Entradas, saídas, estornos e alterações de permissões reutilizam o mutex administrativo existente, com timeout de bloqueio de três segundos. Isso protege revogações concorrentes e mantém consistência com a importação atual, mas serializa escritas inclusive entre contratos diferentes. Não é solução de alta escala; particionar esse bloqueio exige desenho e novos ensaios.

INSERT/UPDATE/DELETE diretos em saldos foram revogados de `authenticated`, inclusive os grants de coluna antigos. Os mecanismos autorizados são a nova RPC de movimento e o importador transacional existente. O livro de movimentos é append-only, com trigger contra UPDATE/DELETE. Superusuários continuam uma fronteira de confiança e precisam de controle operacional.

Importação permanece uma **fotografia**, com lote e auditoria próprios. Não gera entradas/saídas fictícias; portanto o livro de movimentos não é sozinho uma reconciliação completa de fotografias importadas. Saldos anteriores não foram convertidos em movimentos sintéticos. RM, OC, compras e comunicação de recebimento permanecem fora do sistema.

## Permissões

O frontend centraliza nomes e tipos em `stock-permissions.ts`, mas não decide autorização. A fonte final é PostgreSQL: helpers privados, grants, RLS e RPCs `security definer` com search_path vazio. Não há chave service_role ou senha administrativa no navegador.

| Capacidade | Padrão / efeito |
| --- | --- |
| `estoque.visualizar` | Todos os perfis ativos; consulta somente o escopo de contratos do perfil |
| `entrada.visualizar`, `saida.visualizar` | Almoxarife e gestores; lê esse tipo de movimento no escopo autorizado |
| `entrada.registrar`, `saida.registrar` | Almoxarife e gestores; operações independentes, inclusive sem consulta geral de estoque |
| `historico.visualizar_proprio` | Almoxarife e gestores; consulta seus movimentos |
| `historico.visualizar_geral` | Gestores; consulta movimentos no escopo autorizado |
| `relatorios.exportar` | Almoxarife e gestores; apenas movimentos que também consegue consultar |
| `usuarios.visualizar` | Gestores; diretório, vínculos e auditoria de permissões |
| `usuarios.gerenciar` | Gestores; atribuir cargo, ativar/desativar e alterar vínculos de outro usuário |
| `cargos.gerenciar` | Gestores; criar/renomear/editar padrões de cargos personalizados |
| `permissoes.gerenciar` | Gestores; conceder/negar/restaurar herança individual |
| `movimentacoes.estornar` | Gestores; movimento compensatório com motivo |

Gestores significa proprietário e administrador, sujeitos aos ajustes efetivos; proprietário permanece com todas as capacidades. Diretor continua consultando todos os contratos; funcionário autorizado, almoxarife, coordenador e planejamento continuam restritos aos vínculos. Cargo personalizado não amplia esse escopo. Perfil inativo não acessa dados nem operações.

Precedência: proprietário integral; nos demais, ajuste individual permitir/negar prevalece sobre o cargo personalizado ou, se ausente, o cargo do perfil. Remover ajuste restaura a herança. Alterar um usuário não altera os colegas; editar um cargo altera seus usuários, com validação de teto em cada um. A permissão de registrar também permite recuperar o próprio comprovante desse tipo; a de visualizar permite ler esse tipo no contrato. O menu Histórico exige uma das permissões de histórico.

As quatro capacidades administrativas exigem também perfil de sistema proprietário/administrador; um cargo chamado “Administrador” não promove um funcionário. Não se pode modificar a própria conta, diretamente ou editando o cargo atribuído a si. Administrador não administra proprietário, não cria proprietário e não concede nem restaura capacidades acima das próprias, **mesmo em alvos inativos**. Os cargos de sistema são imutáveis; crie um personalizado. O cadastro Auth continua fora da interface.

Cada operação administrativa usa sua capacidade específica. A consulta somente de cargos pode funcionar sem expor usuários, vínculos ou auditoria; o diretório exige `usuarios.visualizar`. A interface desabilita operações não permitidas e o servidor repete a verificação.

## RPCs novas

`stock_context`, `stock_post`, `stock_reverse`, `stock_history`, `stock_report`, `stock_admin_snapshot`, `stock_save_role`, `stock_assign_role`, `stock_set_override`. Somente authenticated recebe EXECUTE; perfis ativos e capacidades são verificados internamente. O request `{scope:'roles'}` de `stock_admin_snapshot` entrega somente cargos e seus padrões. As RPCs administrativas históricas mantêm assinatura, mas passam a respeitar os novos limites de usuários. Nenhuma função privada é publicada como rota PostgREST.

Ver [relatório de testes e limitações](relatorio-v11.md). Os bloqueios de piloto da v1.0 continuam abertos.
