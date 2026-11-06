// Surface initialization failures instead of leaving an apparently empty system.
const showFailure = (error) => {
  let banner = document.getElementById("startupError");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "startupError";
    banner.className = "notice";
    banner.setAttribute("role", "alert");
    (document.querySelector("main") || document.body).prepend(banner);
  }
  banner.hidden = false;
  banner.textContent = `Não foi possível inicializar a aplicação: ${error?.message || String(error)}. Os dados locais não foram apagados. Confira o Console do navegador e use o servidor Vite (npm run dev).`;
};
window.addEventListener("error", (event) =>
  showFailure(event.error || event.message),
);
window.addEventListener("unhandledrejection", (event) =>
  showFailure(event.reason),
);
async function initialize() {
  const { resolveOnlineConfiguration } =
    await import("../ts/data/online-config.ts");
  const configuration = resolveOnlineConfiguration({
    DEV: import.meta.env.DEV,
    VITE_JP_ONLINE_LOCAL: import.meta.env.VITE_JP_ONLINE_LOCAL,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env
      .VITE_SUPABASE_PUBLISHABLE_KEY,
  });
  if (configuration) {
    const { mountOnline } = await import("../ts/online-interface.ts");
    await mountOnline(configuration);
  } else await import("./script.js");
}
initialize().catch(showFailure);
