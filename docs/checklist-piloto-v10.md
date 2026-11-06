# JP Estoque v1.0 — checklist de implantação e operação

**Resultado atual: NÃO APROVADO PARA PILOTO.** Este checklist não autoriza publicação, banco remoto, contas reais, SMTP ou uso de planilhas corporativas. Campos pendentes exigem evidência, responsável e data da JP. Teste local aprovado é somente um dos critérios.

## Gates técnicos de laboratório

- [x] Relatório final v1.0 com regressões unitárias, PostgreSQL, Chromium, Auth/PostgREST e operação, sem falhas ou testes omitidos não justificados.
- [x] Comparação dos hashes das cinco migrações com `790251b`, sem alteração histórica.
- [x] Cadastro público negado pelo servidor, identidade sem perfil sem autorização, metadata sem poder de elevar perfil.
- [x] Convite/confirmação/recovery com tokens legítimos e recovery de uso único no laboratório; nenhuma senha/JWT/TOTP em evidências.
- [x] TOTP real emite AAL2 no laboratório; diferenciar disponibilidade de MFA e enforcement, que continua pendente.
- [x] XLSX fictícios variados; precisão, descarte, reimportação, concorrência e atomicidade; ausência não zera saldo.
- [x] Dump/restauração cifrada em base nova comparando Auth, tabelas, constraints, RLS, funções, grants e segredo de assinatura, sem afetar a base fonte.
- [x] Inventário de licenças/advisories revisado, resultados datados e cobertura explicitada.

Os scans das quatro imagens foram executados, mas o gate HIGH/CRITICAL permanece reprovado; a aprovação do piloto abaixo continua bloqueada. O relatório e as evidências preenchidas são a fonte do resultado destes itens; caixas neste modelo não substituem execução.

## Gates obrigatórios antes de autorizar o piloto

- [ ] Patrocinador JP, dono do processo, responsável técnico, suporte e aprovador de segurança nomeados; usuários/contratos e duração do piloto definidos.
- [ ] Classificação de dados, finalidade, base legal, retenção, descarte, LGPD e acesso à auditoria aprovados.
- [ ] Critérios de sucesso/encerramento, carga esperada, quantidade de contratos/linhas/usuários simultâneos e SLO definidos pela JP.
- [ ] Política para fotografias idênticas em períodos diferentes decidida e implementada/testada quando necessário (R07).
- [ ] Proteção contra edição perdida no CRUD administrativo multioperador implementada e validada (R05).
- [ ] Artefato online sem servidor Vite DEV, pipeline, rollback e ambiente separado revisados. A aplicação atual deliberadamente proíbe build online.
- [ ] Domínio, DNS, certificado HTTPS, CSP, HSTS, headers, redirects exatos e testes de callback/recovery aprovados. Não usar wildcard/redirect do usuário.
- [ ] Supabase/local ou outra infraestrutura escolhida formalmente; nunca criar projeto remoto automaticamente. Postgres/Studio e chaves administrativas fora do browser/rede pública.
- [ ] Secret manager e rotação aprovados; ambientes dev/homologação/piloto com contas, chaves e backups separados. Somente URL/chave pública podem entrar em VITE\_\*.
- [ ] SMTP autorizado e entrega/rejeição/expiração/uso único/email confirmado testados na UI real, com SPF/DKIM/DMARC e rate limits. Nenhum envio real ocorreu neste laboratório.
- [ ] MFA de proprietário/administrador e recuperação assistida implementados; RLS/RPC negam AAL1 onde exigido; perda de fator e indisponibilidade exercitadas.
- [ ] Provisionamento sem cadastro público e desligamento com sessão existente ensaiados pelo operador autorizado.
- [ ] Scans de imagens e binários, teste independente de segurança e aceite de licenças concluídos; nenhum achado alto aberto sem decisão formal fundamentada.
- [ ] Backup cifrado fora do host e chave independente; retenção e RPO/RTO aprovados; restore completo de Auth/PostgREST/UI em outro host e recuperação após perda de segredos testados.
- [ ] Monitoramento e alertas instalados e testados: disponibilidade Auth/API, falhas/negações, latência, locks, disco, idade do backup e sucesso de restore; sem payloads/dados pessoais.
- [ ] Medição de concorrência com carga representativa da JP atende SLO; fila/janela de importação e resposta a lock timeout aprovadas.
- [ ] Homologação de consulta e importação com responsáveis JP; planilha real somente após autorização específica e tratamento de dados. RM/OC/compras/recebimento permanecem externos.
- [ ] Treinamento, manual operacional, plantão, rollback/critério de interrupção e termo formal de autorização do piloto assinados.

## Rotina proposta

Diariamente: verificar disponibilidade, erros/negações anômalos, lock waits, espaço e backup. Por importação: conferir destino, diferenças, descarte, responsável e recibo; não repetir conteúdo idêntico como novo ciclo sem política aprovada. Semanalmente: rever acessos e atualizações/advisories. Na periodicidade aprovada: ensaio de recuperação e revisão da retenção. Frequências, limiares e responsáveis definitivos exigem decisão JP.

Interromper o piloto em suspeita de exposição de dados, perda de isolamento, falha de integridade, backup sem recuperação ou indisponibilidade acima do limite aprovado. Bloquear escrita, preservar evidências com acesso restrito, revogar sessões/vínculos por procedimento e comunicar o responsável. Não limpar localStorage nem apagar auditoria para diagnosticar.
