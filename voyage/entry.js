(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  if (params.has("lesson") || location.hash.startsWith("#lesson=")) {
    location.replace("expeditions.html" + location.search + location.hash);
    return;
  }

  const message = document.getElementById("load-message");
  if (location.protocol === "file:") {
    const online = document.createElement("a");
    online.href = "https://mingyucao111.github.io/number-islands/";
    online.textContent = "Open the 3D game";
    message.replaceChildren(online);
    return;
  }

  const entry = new URL("main.mjs", document.currentScript.src);
  import(entry).then(({ startVoyage }) => startVoyage()).catch((error) => {
    console.error(error);
    message.textContent = "The islands require a browser with WebGL 2.";
  });
})();
