# Arquitetura de acesso — v0.2 consolidada

O sistema continua sendo um protótipo local com dados fictícios. Não há autenticação, banco compartilhado ou proteção de dados reais. A seleção de usuário demonstra cenários e não cria sessão autenticada.

## Permissões centralizadas

`code/ts/access.ts` é a única associação de perfis a capacidades no cliente. `rolePermissions` dá a Proprietário e Administrador as mesmas permissões: consulta global, gerenciamento/exclusão de materiais, fornecedores, contratos, usuários, permissões, status, histórico e configurações. Diretor possui somente consulta global; os outros quatro perfis consultam contratos vinculados. Inativos não possuem capacidades, independentemente do perfil.

Componentes usam `hasPermission`, `canManage` e `canReadContract`, sem comparações locais de nomes de perfis. Os nomes internos TypeScript usam minúsculas (`proprietario`, `administrador`, etc.). O cadastro de vínculos continua explícito para todos; os dois perfis administrativos e o Diretor têm consulta global por capacidade, independentemente da lista.

`DemoAdministration` valida alterações fictícias e mantém vínculos consistentes ao renomear contratos e fornecedores. Bloqueia emails/nome de contrato/nome de fornecedor duplicados, contratos inexistentes em usuários, exclusão de registros vinculados e perda do último Proprietário ou Administrador ativo. Essas validações orientam o protótipo e não impedem adulteração pelo navegador.

O histórico inclui autor fictício, horário, ação e valores antes/depois. É armazenado localmente junto aos cadastros de teste, pode ser adulterado e não representa auditoria confiável. Não armazena identidade autenticada, tokens ou escolha do seletor. Dados administrativos locais ficam em `jp_estoque_admin_demo_v02` e materiais em `jp_estoque_demo_v02`; não há transação compartilhada ou sincronização. Se o armazenamento falhar, alterações ficam em memória.

## Integração futura

`types.ts` define os contratos de IdentityProvider, MaterialRepository e AdministrationRepository. Implementar IdentityProvider com Supabase Auth e buscar perfil pelo ID autenticado igual a `auth.users.id`. Resolver status, perfil e vínculos no banco; nunca aceitar essas informações do seletor, localStorage ou metadata editável pelo usuário.

Substituir adaptadores de teste por operações remotas individuais. Não enviar a coleção completa de materiais/usuários para filtrar no navegador. Usar `contract_id` com chave estrangeira nos materiais e na tabela `user_contracts`; mapear o nome do contrato apenas na apresentação. Normalizar também o fornecedor com ID na implementação definitiva.

`supabase-proposta.sql` é uma proposta para revisão, não uma migração aplicada. `private.is_admin()` aceita Proprietário e Administrador ativos, mantendo paridade nas operações administrativas. Políticas de consulta validam escopo e status no banco. RLS e grants restringem leitura/escrita de materiais, fornecedores, contratos, configurações e histórico. Triggers geram histórico no banco; o cliente não pode gravar, editar ou apagar essa trilha.

Gerenciamento de usuários e permissões requer endpoint confiável no servidor: validar a sessão real e a capacidade administrativa atual, permitir Proprietário e Administrador ativos, validar vínculos/status/perfil e proteger o último gestor ativo dentro de uma transação com bloqueio contra concorrência. Perfis e vínculos não têm escrita direta pelo navegador, para impedir autopromoção e reativação sem autorização. Provisionar contas com Auth Admin somente no servidor; nunca embutir chave de serviço no frontend. Registrar o ator autenticado nessa operação, inclusive quando a conexão de serviço não carrega `auth.uid()`.

Antes de produção: remover o simulador e adaptadores locais; criar migrações versionadas e testes de banco com pgTAP/`supabase test db`; validar operações por perfil e contrato, incluindo inativos, sessões antigas, não autenticados, alteração de perfil/status/vínculos, último gestor, autopromoção e escrita indevida de histórico. Os testes locais verificam regras e interface, mas não comprovam RLS: a proposta SQL não foi executada.

RM, OC, compras e recebimento da JP permanecem fora do escopo; OC/NF continuam apenas como referências textuais da consulta existente.

Referência oficial: [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
