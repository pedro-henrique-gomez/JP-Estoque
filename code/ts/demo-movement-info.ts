/** Information only. No local ledger, fake Auth, or writes to existing storage. */
export function mountDemoMovementInfo() {
  const nav = document.querySelector<HTMLElement>(".nav")!,
    dialog = document.createElement("dialog");
  dialog.className = "online-detail";
  dialog.id = "demoMovementInfo";
  const heading = document.createElement("h2"),
    notice = document.createElement("p");
  notice.className = "notice";
  heading.id = "demoMovementInfoTitle";
  dialog.setAttribute("aria-labelledby", heading.id);
  notice.textContent =
    "A demonstração não tem usuário autenticado. Registrar movimentos e gerenciar permissões operacionais exige o Supabase local e Auth real. Execute npm run dev:online. Nenhum saldo local será alterado.";
  const body = document.createElement("div"),
    close = document.createElement("button");
  close.type = "button";
  close.className = "btn";
  close.textContent = "Voltar à demonstração";
  close.onclick = () => dialog.close();
  dialog.append(heading, notice, body, close);
  document.body.append(dialog);
  const group = document.createElement("h3");
  group.className = "stock-nav-group";
  group.textContent = "Movimentações — requer Auth real";
  nav.append(group);
  for (const [name, labels] of [
    [
      "↘ Entrada de Materiais",
      [
        "Contrato de destino",
        "Material do catálogo",
        "Código automático",
        "Quantidade recebida",
        "Unidade automática",
        "Fornecedor",
        "OC existente",
        "NF",
        "Data/hora do servidor",
        "Responsável autenticado",
        "Observações",
      ],
    ],
    [
      "↗ Saída de Materiais",
      [
        "Contrato de origem",
        "Material do estoque",
        "Código automático",
        "Quantidade retirada",
        "Unidade automática",
        "Saldo disponível",
        "Local de destino",
        "Nome completo de quem retirou",
        "Empresa",
        "Responsável autenticado",
        "Data/hora do servidor",
        "Observações",
      ],
    ],
    ["Histórico de Movimentações", []],
    ["Usuários e Permissões", []],
    ["Cargos", []],
  ] as [string, string[]][]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.onclick = () => {
      heading.textContent = name;
      body.replaceChildren();
      for (const label of labels) {
        const wrap = document.createElement("label"),
          input = document.createElement("input");
        wrap.textContent = label;
        input.disabled = true;
        wrap.append(input);
        body.append(wrap);
      }
      dialog.showModal();
    };
    nav.append(button);
  }
}
