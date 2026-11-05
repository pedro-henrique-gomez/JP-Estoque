# JP Estoque 0.2

Protótipo de consulta de estoque, com a identidade visual da JP e arquivos separados por linguagem.

```text
code/html/       Página
code/css/        Estilos
code/js/         Interações e funcionalidades existentes
code/ts/         Tipos, regras de apresentação, usuários fictícios e armazenamento de teste
img/             Logo
tests/           Testes de regras e integração da interface
docs/            Arquitetura e proposta SQL para a futura integração
```

Requer Node.js 22.12+ (ou 20.19+). Execute `npm ci`, `npm run dev` e abra a URL exibida no terminal. O uso de módulos TypeScript requer o servidor de desenvolvimento; abrir o HTML diretamente com `file://` não é mais suportado. Validação: `npm test` e `npm run build`. Para conferir o resultado compilado: `npm run preview`, em `/code/html/index.html`.

## Demonstração de perfis

A seleção de usuários fictícios **não é login** e não autentica ninguém. Todos os dados de demonstração são enviados ao navegador; filtros, botões e verificações JavaScript não são uma barreira de segurança.

| Perfil ativo                                                  | Consulta                       | Cadastros/importação |
| ------------------------------------------------------------- | ------------------------------ | -------------------- |
| Funcionário autorizado, almoxarife, coordenador, planejamento | Somente contratos vinculados   | Não                  |
| Diretor, proprietário                                         | Todos os contratos cadastrados | Não                  |
| Administrador                                                 | Todos os contratos cadastrados | Sim                  |
| Qualquer perfil inativo                                       | Nenhum contrato                | Não                  |

Cada usuário possui ID, nome, email fictício, perfil, status e IDs dos contratos autorizados. A matriz mostra cada perfil usando o status e os vínculos do usuário selecionado; o perfil atual aparece em destaque. Há exemplos inativos e sem vínculos.

Consulta, busca, detalhes, filtros, fornecedores, exportação CSV, cadastro/edição, restauração e importação com prévia foram preservados. A senha fixa antiga foi removida. O usuário inicial é um funcionário autorizado ao Contrato A. A administração demonstrativa é acessível selecionando Gabriela (Administrador). Somente A, B, C e D são contratos válidos nesta demonstração; importações com contratos desconhecidos são rejeitadas. OC/NF continuam sendo apenas referências textuais existentes. Não existem compras, RM, criação de OC ou movimentações.

O adaptador `demo-storage.ts` guarda somente materiais fictícios em `jp_estoque_demo_v02`, recuperando registros válidos da v0.1 quando presentes, sem apagar a versão anterior. Nunca armazena sessão ou escolha de perfil. Quando o armazenamento falha, usa memória durante a sessão. Não inserir dados reais.

A arquitetura futura está descrita em [docs/arquitetura.md](docs/arquitetura.md). Não há Supabase conectado ou autenticação implementada nesta versão.
