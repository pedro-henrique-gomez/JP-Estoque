# Importação local de planilhas — JP Estoque v0.3

Correção posterior: a inicialização preserva snapshots sem data, sinaliza incompatibilidades sem sobrescrever chaves e exige carga explícita de materiais fictícios em base vazia. Veja [diagnóstico e validação no Chromium](correcao-inicializacao.md). O fluxo de importação abaixo permanece disponível.

## Uso

1. Execute `npm ci` e `npm run dev`. Abra `/code/html/index.html` no servidor exibido.
2. No simulador, selecione Proprietário ou Administrador ativo e abra Administração → Importar Excel/CSV. A seleção é demonstração, não login.
3. Selecione um arquivo fictício `.xlsx`, `.xls` ou `.csv` de até 10 MB. Não use dados corporativos reais.
4. Escolha a aba. O sistema sugere a linha de cabeçalho nos primeiros 100 registros; ajuste-a se necessário e revise o mapeamento por índice da coluna.
5. Mapeie os cinco campos obrigatórios: código, descrição, unidade, contrato e quantidade. Os demais são opcionais. A mesma coluna não pode preencher dois campos.
6. Analise a prévia. Cada linha começa como **Ignorar**. Escolha em lote adicionar somente novos saldos ou atualizar somente existentes; também pode escolher individualmente. A prévia tem páginas de 50 linhas e mostra todas as linhas por navegação. Erros ficam ignorados; é possível aplicar somente as linhas válidas escolhidas.
7. Confira os dados atuais/propostos e as diferenças globais. Confirme explicitamente para aplicar. Cancelar não altera nada.
8. Consulte o relatório na própria aba e o resumo no histórico administrativo. Relatórios incluem data, nome do arquivo, aba, linha do cabeçalho, autor fictício, contadores e resultados de todas as linhas. O arquivo original não é armazenado.

## Catálogo global e saldos

`GlobalProduct` guarda código, descrição, unidade, categoria, fabricante e modelo. `ContractBalance` guarda a referência ao produto, ID do contrato, quantidade registrada, localização e referências textuais existentes (fornecedor/OC/NF). Um produto pode ter saldos em vários contratos, mas apenas um cadastro global por código normalizado. Não se cria contrato a partir da importação.

`Material` continua como projeção de compatibilidade para as telas da v0.2. `inventory.ts` transforma a projeção em produtos e saldos separados. O snapshot local mantém `products` e `balances` separados e a projeção `materials`, regenerados no mesmo salvamento, junto aos relatórios. A chave `jp_estoque_demo_v02` foi mantida para preservar os testes e a base anterior e passa a ter `version: 3`. A aplicação continua lendo a projeção compatível. Não existem duas fontes editáveis de quantidade global: somente os saldos têm quantidade. Bases v0.1/v0.2 continuam carregando sem exclusão automática de registros.

Adicionar um saldo para código existente reutiliza o produto global e preserva seus dados. Atualizar existente substitui **apenas o saldo escolhido**, sem somar, e aplica explicitamente as diferenças globais do produto nos demais contratos. Os saldos dos outros contratos permanecem iguais. Campos opcionais em branco preservam valores existentes. Se quiser apagar um campo opcional, use a edição manual. Alterar unidade de um produto existente pela importação é rejeitado, pois não há conversão automática de unidades.

A edição manual também compartilha os campos globais entre registros do mesmo código. Se uma base antiga apresentar descrições/unidades conflitantes para o mesmo código ou saldos duplicados por código/contrato, a importação é bloqueada até a reconciliação manual. Não há escolha automática de qual registro antigo prevalece. Dados corporativos reais não devem ser carregados neste protótipo.

## Validações e duplicidades

- Código não vazio, até 80 caracteres; letras, números, espaços, ponto, `/`, `_` e `-`. Comparação sem distinção entre maiúsculas/minúsculas e espaços repetidos; zeros à esquerda textuais ou com máscara Excel `00000` são preservados.
- Descrição de 2 a 240 caracteres, sem caracteres de controle.
- Unidades reconhecidas: un, m, m², m³, kg, g, l, ml, saco, caixa, rolo, par, jogo, pacote, kit e t; aliases como peça/und e cx são normalizados.
- Quantidades numéricas finitas, não negativas e até `Number.MAX_SAFE_INTEGER`. Vazio não vira zero. Aceita vírgula decimal e formatos explícitos `1.234,50` e `1,234.50`. Um único ponto ou vírgula é separador decimal: `1.234` significa 1,234 unidade. Não aceita moeda ou expressão matemática.
- Contrato deve existir e ser identificado sem ambiguidade. Comparação normaliza caixa, acentos e espaços; usa o nome cadastrado na aplicação.
- Mesmo código/contrato repetido no arquivo gera erro em todas as ocorrências. Mesmo código em contratos diferentes é válido se os dados globais forem coerentes. Diferenças globais conflitantes no arquivo são erros, não resolvidas pela ordem das linhas.
- Descrições equivalentes após normalização e ordenação das palavras, com códigos diferentes, geram aviso de possível duplicidade. É uma heurística, não identificação garantida de produto; não há fusão automática.
- Fórmulas, erros de célula Excel e datas nos campos mapeados geram erro. Fórmulas não são executadas ou calculadas pelo aplicativo. Arquivos criptografados/corrompidos apresentam mensagem de leitura.
- Limites de leitura: 10 MB, até 50 abas, 200 colunas e 10.000 registros, com até 100 linhas adicionais para títulos/cabeçalhos. CSV é lido como UTF-8.

## Organização e integridade

- `spreadsheet-reader.ts`: leitura local, CSV com aspas e delimitadores, seleção de abas e proteção de limites.
- `import-types.ts`: contratos TypeScript de catálogo, saldos, planos, ações e relatórios.
- `import-service.ts`: sugestão de cabeçalhos, validação, duplicidades e planejamento/aplicação sem mutar a base de entrada.
- `import-interface.ts`: seleção, mapeamento, prévia paginada, escolhas, confirmação e relatórios.
- `inventory.ts`: catálogo global e saldos por contrato; `demo-storage.ts`: persistência local de teste.

Alterar arquivo, aba ou mapeamento invalida a prévia. A aplicação revalida as linhas e o estado da base no momento da confirmação. Se a base mudou desde a análise, exige nova prévia. Trocar o perfil descarta leituras pendentes e escolhas anteriores. Persistir o novo snapshot é condição para trocar a base em memória; falha de localStorage não aplica silenciosamente uma parte dos registros. O histórico administrativo fica em outra chave e sua falha é informada; o relatório da importação continua no snapshot do estoque.

Não há movimentações, compras, RM, emissão de OC ou alteração do recebimento da JP. Nenhuma quantidade é somada por importação. As permissões locais orientam o protótipo e não protegem dados.

## Biblioteca e licença

SheetJS Community Edition **0.20.3**, instalada a partir do pacote oficial `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, com integridade registrada no `package-lock.json`. Licença **Apache-2.0**, verificada no `package.json` e no arquivo `LICENSE` do pacote instalado. A cópia integral é distribuída em `public/licenses/SheetJS-LICENSE.txt` e copiada ao build em `dist/licenses/`. Não é uma licença do aplicativo inteiro. A leitura carrega o módulo empacotado localmente, sem CDN em tempo de uso.

Fonte de instalação e versão: [documentação oficial SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). Referência de leitura: [SheetJS — Reading Files](https://docs.sheetjs.com/docs/api/parse-options/).

## Próxima integração com Supabase

Substituir o armazenamento local por catálogo `products` único por código, `contract_balances` único por `(product_id, contract_id)` e `import_batches`/resultados para os relatórios. Consultas de produto devem exigir saldo em contrato autorizado (ou consulta global), evitando exposição de catálogo inteiro a usuários restritos. Escritas e importação exigirão Proprietário ou Administrador ativo, verificados no servidor e no banco.

Aplicar importação em transação com confirmação de versão, idempotência por lote, validação de vínculos, auditoria confiável e políticas RLS. Nunca usar o seletor ou permissões do frontend como autorização real. A proposta SQL da v0.2 em `supabase-proposta.sql` continua sendo referência não aplicada e ainda precisará ser migrada para o modelo normalizado da v0.3 e validada com testes de banco.

## Privacidade e versionamento

O leitor não envia arquivos ou seu conteúdo para rede/servidor. A aplicação é local. Somente metadados, resultados e dados escolhidos ficam no navegador para testes. Os testes geram XLSX/XLS fictícios apenas em memória; não há planilhas no repositório. `.gitignore` bloqueia arquivos Excel/CSV e a pasta `imports/`. Não adicionar dados ou relatórios corporativos reais ao GitHub.
