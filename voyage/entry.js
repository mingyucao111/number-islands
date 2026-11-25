(() => {
  "use strict";

  const query = new URLSearchParams(location.search);
  if (query.has("lesson") || location.hash.startsWith("#lesson=")) {
    location.replace("expeditions.html" + location.search + location.hash);
    return;
  }

  const message = document.getElementById("load-message");
  const begin = document.getElementById("begin");
  const dialog = document.getElementById("controls");
  document.getElementById("menu-controls").addEventListener("click", () => dialog.showModal());
  document.getElementById("close-controls").addEventListener("click", () => dialog.close());
  function showFailure(text) {
    message.textContent = text;
    begin.textContent = "Voyage unavailable";
  }
  if (location.protocol === "file:") {
    showFailure("Open the online voyage or serve this folder locally to explore the 3D island.");
    const online = document.createElement("a");
    online.className = "primary";
    online.href = "https://mingyucao111.github.io/number-islands/";
    online.textContent = "Play online";
    begin.replaceWith(online);
    return;
  }

  const entry = new URL("main.mjs", document.currentScript.src);
  import(entry).then(({ startVoyage }) => startVoyage()).catch((error) => {
    console.error(error);
    showFailure("This browser could not start the 3D scene. Try another browser with WebGL 2.");
  });
})();
