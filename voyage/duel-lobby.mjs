import { joinDuelHost, startDuelHost } from "./duel-link.mjs";

const find = (id) => document.getElementById(id);

function readCode(input) {
  const data = String(input ?? "").trim();
  if (data.length > 36000) return "";
  const hash = data.indexOf("#duel=");
  return hash < 0 ? data : data.slice(hash + 6);
}

export function createDuelLobby({ onEnter, onDismiss }) {
  const dialog = find("duel-lobby");
  const input = find("duel-paste");
  const output = find("duel-share-code");
  const status = find("duel-link-status");
  const invite = find("duel-make-invite");
  const useCode = find("duel-connect");
  let operation;

  function setBusy(busy) {
    invite.disabled = busy || Boolean(operation?.side === 0 && operation.transport);
    useCode.disabled = busy;
  }

  function clear(current) {
    current?.controller.abort();
    current?.transport?.close();
  }

  function open(prefill = "") {
    if (dialog.open) return;
    operation = undefined;
    input.value = readCode(prefill);
    output.value = "";
    find("duel-output").hidden = true;
    setBusy(false);
    status.textContent = input.value ? "Friend invite ready. Use the code to prepare a reply." : "";
    dialog.showModal();
    input.focus();
  }

  function displayCode(code, host) {
    const url = location.protocol === "file:" || location.hostname === "localhost"
      ? new URL("https://mingyucao111.github.io/number-islands/") : new URL(location.href);
    url.search = "";
    url.hash = "duel=" + code;
    output.value = host ? url.href : code;
    find("duel-output-label").textContent = host ? "Invite link to send to your friend" : "Reply code for your friend";
    find("duel-output").hidden = false;
  }

  function makeOperation(side) {
    clear(operation);
    const current = { side, controller: new AbortController(), transport: null, consumer: null, queue: [], handedOff: false };
    operation = current;
    return current;
  }

  function events(current) {
    return {
      onOpen() {
        if (operation !== current || !current.transport) return;
        current.handedOff = true;
        dialog.close();
        onEnter({
          side: current.side,
          send: current.transport.send,
          close() { current.transport.close(); },
          listen(handler) {
            current.consumer = handler;
            for (const value of current.queue.splice(0)) handler(value);
          },
        });
      },
      onMessage(message) {
        if (current.consumer) current.consumer({ message });
        else if (current.queue.length < 16) current.queue.push({ message });
      },
      onClose(reason) {
        if (current.handedOff) current.consumer?.({ closed: true, reason });
        else if (operation === current && !current.controller.signal.aborted) {
          operation = undefined;
          setBusy(false);
          status.textContent = "The direct connection closed. You can create a new invite or return to the island.";
        }
      },
      onError(error) {
        if (!current.handedOff && operation === current) {
          status.textContent = error.message || "The direct connection could not start.";
        }
      },
    };
  }

  invite.addEventListener("click", async () => {
    const current = makeOperation(0);
    setBusy(true);
    status.textContent = "Preparing an invite…";
    try {
      const transport = await startDuelHost(events(current), { signal: current.controller.signal });
      if (operation !== current) { transport.close(); return; }
      current.transport = transport;
      displayCode(transport.code, true);
      status.textContent = "Send the invite. Paste your friend's reply into the field below.";
      input.value = "";
    } catch (error) {
      if (operation === current) status.textContent = error.message;
    } finally {
      if (operation === current) setBusy(false);
    }
  });

  useCode.addEventListener("click", async () => {
    const code = readCode(input.value);
    if (!code) { status.textContent = "Paste an invite link or reply code."; return; }
    if (operation?.side === 0 && operation.transport) {
      const current = operation;
      setBusy(true);
      status.textContent = "Connecting to your friend…";
      try { await current.transport.accept(code); }
      catch (error) {
        if (operation === current) {
          status.textContent = error.message;
          setBusy(false);
        }
      }
      return;
    }
    const current = makeOperation(1);
    setBusy(true);
    status.textContent = "Preparing a reply…";
    try {
      const transport = await joinDuelHost(code, events(current), { signal: current.controller.signal });
      if (operation !== current) { transport.close(); return; }
      current.transport = transport;
      displayCode(transport.code, false);
      status.textContent = "Send your reply code back to your friend. The arena opens when connected.";
    } catch (error) {
      if (operation === current) {
        status.textContent = error.message;
        setBusy(false);
      }
    }
  });
  find("duel-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(output.value); status.textContent = "Copied."; }
    catch { output.select(); status.textContent = "Code selected. Copy it with your keyboard or device menu."; }
  });
  find("duel-cancel").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    const former = operation;
    operation = undefined;
    if (!former?.handedOff) {
      clear(former);
      onDismiss();
    }
  });
  return { open, isOpen() { return dialog.open; } };
}
