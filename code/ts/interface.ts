/** Presentation/keyboard behavior only. No permission or persistence decisions. */
export function mountInterface(clearFilters: () => void) {
  const modal = document.getElementById("modal")!;
  const close = document.getElementById("close")!;
  const search = document.getElementById("search") as HTMLInputElement;
  let previousFocus: HTMLElement | null = null;
  let previousOverflow = "";
  const state = window as Window & { jpInterfaceEvents?: AbortController };
  state.jpInterfaceEvents?.abort();
  const events = new AbortController();
  state.jpInterfaceEvents = events;
  const options = { signal: events.signal };
  const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-tab]")];
  const syncTab = (active: HTMLButtonElement) => {
    tabs.forEach((tab) => {
      const selected = tab === active;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
  };
  tabs.forEach((tab) => {
    tab.id = `tab-${tab.dataset.tab}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", tab.dataset.tab!);
    const panel = document.getElementById(tab.dataset.tab!)!;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    tab.addEventListener("click", () => syncTab(tab), options);
    tab.addEventListener(
      "keydown",
      (event) => {
        if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
          return;
        const enabled = tabs.filter((tab) => !tab.disabled);
        const index = enabled.indexOf(tab);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? enabled.length - 1
              : (index +
                  (event.key === "ArrowRight" ? 1 : -1) +
                  enabled.length) %
                enabled.length;
        event.preventDefault();
        enabled[next]?.focus();
        enabled[next]?.click();
      },
      options,
    );
  });
  syncTab(tabs.find((tab) => tab.classList.contains("active")) ?? tabs[0]);
  document
    .querySelectorAll<HTMLButtonElement>("[data-page]")
    .forEach((button) => {
      if (button.classList.contains("active"))
        button.setAttribute("aria-current", "page");
      button.addEventListener(
        "click",
        () => {
          document
            .querySelectorAll("[data-page]")
            .forEach((button) => button.removeAttribute("aria-current"));
          button.setAttribute("aria-current", "page");
        },
        options,
      );
    });
  document.getElementById("clearFilters")!.addEventListener(
    "click",
    () => {
      clearFilters();
      search.focus();
    },
    options,
  );
  const hide = () => {
    if (modal.classList.contains("hidden")) return;
    modal.classList.add("hidden");
    document.body.style.overflow = previousOverflow;
    const target = previousFocus?.isConnected
      ? previousFocus
      : document.querySelector<HTMLElement>("[data-page].active");
    target?.focus();
  };
  document.addEventListener(
    "keydown",
    (event) => {
      if (!modal.classList.contains("hidden")) {
        if (event.key === "Escape") {
          event.preventDefault();
          hide();
          return;
        }
        if (event.key === "Tab") {
          const controls = [
            ...modal.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
            ),
          ].filter((element) => element.getClientRects().length);
          const first = controls[0] ?? close,
            last = controls.at(-1) ?? close;
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              !modal.contains(document.activeElement))
          ) {
            event.preventDefault();
            last.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last ||
              !modal.contains(document.activeElement))
          ) {
            event.preventDefault();
            first.focus();
          }
        }
        return;
      }
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) &&
        !target.isContentEditable &&
        !document.getElementById("consulta")!.classList.contains("hidden")
      ) {
        event.preventDefault();
        search.focus();
      }
    },
    options,
  );
  return {
    open() {
      if (modal.classList.contains("hidden")) {
        previousFocus = document.activeElement as HTMLElement;
        previousOverflow = document.body.style.overflow;
      }
      modal.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      close.focus();
    },
    close: hide,
  };
}
