# Autenticação e autorização futuras

`types.ts` define User, Role, Contract, Material, IdentityProvider e MaterialRepository. `access.ts` contém regras puras para a apresentação. `demo-access.ts` é exclusivamente um simulador; `demo-storage.ts` é um adaptador de teste. Não converter o seletor de demonstração em provedor de identidade.

Na futura integração, implementar IdentityProvider com Supabase Auth e buscar o perfil usando o ID autenticado. O ID do usuário deve corresponder a `auth.users.id`. Resolver vínculos a partir de `user_contracts`, nunca de localStorage, parâmetros enviados pelo cliente ou metadata editável pelo usuário. Não confiar em emails como identificador de autorização.

Implementar MaterialRepository com consultas remotas; a API deve delegar ao Postgres as políticas de autorização. Substituir carregamento e gravação da coleção local por list/upsert remotos (sem gravar uma cópia completa). A interface pode esconder ações para orientar o usuário, mas o servidor deve negar operações independentemente dessa interface. Usuários inativos perdem leitura e escrita mesmo com sessão válida.

`supabase-proposta.sql` é um esboço revisável, **não uma migração aplicada**. Normaliza contratos, perfis e vínculos. RLS usa `auth.uid()` e uma função de escopo no banco, com `search_path` explícito, para evitar consultas recursivas às políticas de perfis. O administrador consulta todos para gerenciar materiais. Apenas administradores ativos escrevem materiais; diretores/proprietários não escrevem. Não há política anônima.

Perfis/status/vínculos devem ser provisionados por uma operação administrativa confiável no servidor, com verificação de administrador ativo, validação, auditoria e proteção do último administrador. O cliente não tem permissão de escrita nessas tabelas e não pode se promover ou reativar. A chave de serviço nunca pode entrar no bundle do frontend. A criação inicial do administrador deve acontecer por processo confiável fora do cliente.

Antes da implantação: criar o projeto Supabase e migrações versionadas, rever grants, validar RLS com pgTAP/`supabase test db`, integrar Auth real e o adaptador remoto, remover o simulador e o armazenamento local do produto de produção. Cobrir SELECT/INSERT/UPDATE/DELETE para usuário não autenticado, quatro perfis restritos com e sem vínculo, diretor, proprietário, administrador e todos os perfis inativos; incluir adulteração do contrato, mudança de perfil/status/vínculos e revogação com sessão aberta. Verificar referências OC/NF somente como campos informativos. Os testes locais desta versão não comprovam segurança de banco: o SQL ainda não foi executado.

Referência oficial consultada: https://supabase.com/docs/guides/database/postgres/row-level-security
