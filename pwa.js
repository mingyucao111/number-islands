(() => {
  "use strict";

  if (!window.isSecureContext || location.protocol === "file:" || globalThis.Capacitor?.isNativePlatform?.()) return;
  const entry = document.currentScript.src;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(new URL("sw.js", entry)).catch(() => {
      // A browser can restrict worker storage without preventing online play.
    });
  }

  const install = document.querySelector("[data-install-app]");
  if (!install || matchMedia("(display-mode: standalone)").matches || navigator.standalone) return;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (/^Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
  let promptEvent = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    promptEvent = event;
    install.hidden = false;
  });
  window.addEventListener("appinstalled", () => { install.hidden = true; });

  if (iOS) install.hidden = false;
  install.addEventListener("click", async () => {
    if (promptEvent) {
      const event = promptEvent;
      promptEvent = null;
      install.hidden = true;
      try { await event.prompt(); } catch { install.hidden = false; }
      return;
    }
    const help = document.createElement("dialog");
    const title = document.createElement("h2");
    title.textContent = "Install Number Islands";
    const message = document.createElement("p");
    message.textContent = iOS
      ? "In Safari, tap Share, then Add to Home Screen. Switch on Open as Web App and tap Add."
      : "Open your browser menu and choose Install app or Add to Home Screen.";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Done";
    close.addEventListener("click", () => help.close());
    help.append(title, message, close);
    help.setAttribute("aria-label", title.textContent);
    help.addEventListener("close", () => {
      help.remove();
      install.focus();
    }, { once: true });
    document.body.append(help);
    help.showModal();
  });
})();
