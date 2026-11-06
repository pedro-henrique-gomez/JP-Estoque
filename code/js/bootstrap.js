// Surface initialization failures instead of leaving an apparently empty system.
const showFailure = (error) => {
  const banner = document.getElementById("startupError");
  banner.hidden = false;
  banner.textContent = `Não foi possível inicializar a aplicação: ${error?.message || String(error)}. Os dados locais não foram apagados. Confira o Console do navegador e use o servidor Vite (npm run dev).`;
};
window.addEventListener("error", (event) =>
  showFailure(event.error || event.message),
);
window.addEventListener("unhandledrejection", (event) =>
  showFailure(event.reason),
);
import("./script.js").catch(showFailure);
