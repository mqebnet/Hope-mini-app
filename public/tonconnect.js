// public/tonconnect.js
import { TonConnectUI } from 'https://esm.sh/@tonconnect/ui@2.0.10';

const manifestUrl = `${window.location.origin}/tonconnect-manifest.json`;
const rootId = 'ton-connect-ui';

let rootEl = document.getElementById(rootId);
if (!rootEl) {
  rootEl = document.createElement('div');
  rootEl.id = rootId;
  rootEl.style.display = 'none';
  document.body.appendChild(rootEl);
}

export const tonConnectUI = new TonConnectUI({
  buttonRootId: rootId,
  manifestUrl,
  uiPreferences: {
    theme: 'DARK'
  }
});
