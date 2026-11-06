# JP Estoque 0.2 — permissões consolidadas

Protótipo local com a identidade visual da JP, materiais e usuários fictícios. Não há autenticação ou banco compartilhado. A seleção de perfil **não é login**; botões e filtros de frontend não protegem dados reais.

```text
code/html/       Página
code/css/        Estilos
code/js/         Consulta, cadastro e importação existentes
code/ts/         Tipos, permissões centrais e administração demonstrativa
img/             Logo
tests/           Regras e integração da interface
docs/            Arquitetura e proposta SQL para futura integração
```

Requer Node.js 22.12+. Execute `npm ci` e `npm run dev`. Abra `/code/html/index.html` na URL exibida. O HTML precisa do servidor para carregar módulos; `file://` não é suportado. Validação: `npm test` e `npm run build`. Para conferir a compilação: `npm run preview`.

| Perfil ativo                                                  | Consulta              | Administração |
| ------------------------------------------------------------- | --------------------- | ------------- |
| Funcionário autorizado, almoxarife, coordenador, planejamento | Contratos autorizados | Não           |
| Diretor                                                       | Todos os contratos    | Não           |
| Proprietário e Administrador                                  | Todos os contratos    | Completa      |
| Qualquer perfil inativo                                       | Nenhum contrato       | Não           |

Selecione Felipe (Proprietário) ou Gabriela (Administrador) no simulador e abra Administração. Ambos podem cadastrar, editar e excluir materiais, gerenciar fornecedores/contratos, cadastrar/editar usuários e seus perfis/vínculos, ativar/desativar usuários, visualizar histórico e editar configurações gerais. A matriz de acesso mostra as mesmas capacidades para os dois perfis.

As abas administrativas usam as permissões centralizadas em `code/ts/access.ts`. Usuários têm ID, nome, email fictício, perfil, status e lista de contratos autorizados. Não é permitido desativar/rebaixar o último Proprietário ou Administrador ativo. Contratos e fornecedores vinculados não podem ser excluídos sem remover os vínculos.

Consulta, busca, filtros, detalhes, fornecedores, exportação CSV, restauração e importação Excel/CSV com mapeamento/prévia foram preservados. Importações aceitam somente contratos cadastrados. Renomeações de fornecedores/contratos atualizam os materiais associados; restauração utiliza os contratos ainda existentes e os nomes atuais. OC/NF continuam apenas como referências; nenhum processo de RM, OC, compras ou recebimento foi modificado.

Materiais fictícios ficam em `jp_estoque_demo_v02`, com recuperação de dados válidos da v0.1. Usuários, vínculos, fornecedores, contratos, histórico e configurações de teste ficam em `jp_estoque_admin_demo_v02`. Esses dados não são seguros ou compartilhados. O histórico é demonstrativo e adulterável. A escolha do seletor não é persistida; nenhum token/sessão é criado. Não inserir dados reais. Para retornar às fixtures iniciais, remova ambas as chaves de teste e recarregue (remova também as chaves v0.1 se não quiser a recuperação antiga).

A [arquitetura futura](docs/arquitetura.md) define adaptadores para Supabase Auth e autorização real com RLS. O SQL é uma proposta não aplicada; a integração e a validação do banco ficam para a próxima etapa.
