# Decisões e pendências da JP — v1.0

**Não há autorização de piloto nesta entrega.** Não foi usada planilha corporativa, enviado email, criado projeto remoto ou publicado o sistema. As decisões abaixo não serão inferidas de testes locais.

| Prioridade           | Decisão/evidência necessária                                                                                                                                              | Responsável a designar                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Bloqueante           | Patrocinador, dono do processo, responsável técnico/segurança, operadores, contratos, participantes, duração e critérios de interrupção do piloto                         | Direção / JP                              |
| Bloqueante           | Classificação dos dados, LGPD, finalidade, base legal, retenção/descarte, acesso à auditoria e autorização para qualquer dado real                                        | JP / jurídico / privacidade               |
| Bloqueante           | Domínio, ambiente de hospedagem e banco, isolamento de rede, TLS/certificados, secret manager, orçamento e pipeline; nenhuma contratação automática                       | TI / segurança                            |
| Bloqueante           | SMTP/remetente autorizado, SPF/DKIM/DMARC, entrega de confirmação/recovery e redirects HTTPS; UI de recovery/confirm ainda precisa ser implementada                       | TI / segurança                            |
| Bloqueante           | MFA obrigatório para proprietário/administrador, enforcement AAL2, UI e recuperação de fator com verificação de identidade e dupla aprovação                              | Segurança / direção                       |
| Bloqueante           | Carga real esperada: usuários simultâneos, contratos/produtos, tamanho/frequência das planilhas, latência/indisponibilidade aceitáveis                                    | Almoxarifado / planejamento / TI          |
| Bloqueante           | Semântica de reimportação periódica: conteúdo idêntico é repetição ou nova fotografia de outro ciclo? A v0.9 devolve recibo original e não reaplica saldo                 | Almoxarifado / planejamento / coordenação |
| Bloqueante           | Proteção de edição simultânea no CRUD e política de janela/fila de importações; controle global atual pode atrasar outros contratos                                       | TI / dono do processo                     |
| Bloqueante           | RPO, RTO, retenção, custódia independente de chave, backup fora do host e restore completo em outra instalação com login/MFA/UI                                           | TI / direção                              |
| Bloqueante           | Remediação/triagem comprovada dos achados altos/críticos de imagens, scan de host/binários, avaliação independente, aceite das licenças e revalidação da stack atualizada | Segurança / jurídico / TI                 |
| Antes de dados reais | Amostra autorizada de formatos de almoxarifado e dicionário de unidades/códigos/contratos; formatos não canônicos exigem correção, não conversão silenciosa               | Almoxarifado / planejamento               |
| Antes de abertura    | Monitoramento, alertas sem PII, plantão, desligamento/revogação, treinamento, rollback e assinatura formal do checklist                                                   | Operação / segurança / direção            |

Os papéis acima são funções propostas, não nomeações efetuadas. Pendências externas não são testes aprovados. A evolução que remover o gate exclusivamente local ou adicionar autenticação operacional exigirá nova implementação, migrações adicionais quando aplicáveis, revalidação e autorização específica.
