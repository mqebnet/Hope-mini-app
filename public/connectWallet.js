// public/connectWallet.js
import { tonConnectUI } from './tonconnect.js';

document.addEventListener('DOMContentLoaded', async () => {
  const button = document.getElementById('ton-connect-button');
  const topNav = document.getElementById('top-nav');
  if (!button || !topNav) return;

  let busy = false;
  const MAINNET_CHAIN = '-239';
  const TESTNET_CHAIN = '-3';
  const menu = document.createElement('div');
  menu.id = 'wallet-popover';
  menu.className = 'hidden';
  menu.innerHTML = `
    <p class="wallet-popover-title">Connected Wallet</p>
    <p id="wallet-address" class="wallet-popover-address">-</p>
    <button id="wallet-disconnect-btn" class="wallet-disconnect-btn">Disconnect</button>
  `;
  topNav.appendChild(menu);

  const addressEl = menu.querySelector('#wallet-address');
  const disconnectBtn = menu.querySelector('#wallet-disconnect-btn');

  const getWalletChain = (wallet) => {
    // TonConnect wallet format varies by version/wallet app.
    return wallet?.account?.chain || wallet?.chain || null;
  };
  const getWalletAddress = (wallet) => {
  const raw = wallet?.account?.address || '';
  if (!raw) return '';
  try {
    // TonConnect UI exposes Address from @ton/core internally
    // Use the address directly — most wallets accept raw format fine
    // For friendly format, convert using the Address class:
    const { Address } = window.TON_CONNECT_UI || {};
    if (Address) {
      return Address.parse(raw).toString({ bounceable: false });
    }
  } catch (_) {}
  return raw; // fallback to raw if conversion fails
};
  const shortAddress = (address) => {
    if (!address || address.length < 13) return address || '-';
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  };
  const closeMenu = () => menu.classList.add('hidden');
  const toggleMenu = () => menu.classList.toggle('hidden');
  const updateMenu = (wallet) => {
    const fullAddress = getWalletAddress(wallet);
    if (!fullAddress) {
      addressEl.textContent = '-';
      addressEl.removeAttribute('title');
      closeMenu();
      return;
    }
    addressEl.textContent = shortAddress(fullAddress);
    addressEl.title = fullAddress;
  };

  const saveWalletToServer = async (address) => {
    if (!address) return;
    try {
      await fetch('/api/user/wallet', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address })
      });
    } catch (err) {
      console.warn('Failed to save wallet address:', err);
    }
  };

  const updateUI = (wallet) => {
    if (wallet) {
      button.innerHTML = `<i data-lucide="wallet"></i> Connected`;
      button.classList.add('connected');
      button.disabled = false;
    } else {
      button.innerHTML = `<i data-lucide="wallet"></i> Connect Wallet`;
      button.classList.remove('connected');
      button.disabled = false;
    }
    if (window.lucide) lucide.createIcons();
  };

  try {
    if (typeof tonConnectUI.restoreConnection === 'function') {
      await tonConnectUI.restoreConnection();
    } else if (tonConnectUI.connectionRestored && typeof tonConnectUI.connectionRestored.then === 'function') {
      await tonConnectUI.connectionRestored;
    }
  } catch (err) {
    console.warn('Wallet restore failed:', err);
  }

  updateUI(tonConnectUI.wallet);
  updateMenu(tonConnectUI.wallet);
  if (tonConnectUI.wallet) {
    saveWalletToServer(getWalletAddress(tonConnectUI.wallet));
  }

  tonConnectUI.onStatusChange((wallet) => {
    const chain = getWalletChain(wallet);
    if (wallet && chain === TESTNET_CHAIN) {
      alert('Switch to TON Mainnet!');
      tonConnectUI.disconnect();
      return;
    }

    if (wallet && !chain) {
      console.warn('Unable to determine wallet chain from TonConnect payload:', wallet);
    } else if (wallet && chain !== MAINNET_CHAIN) {
      console.warn(`Unexpected wallet chain value: ${chain}`);
    }

    updateUI(wallet);
    updateMenu(wallet);

    // Persist wallet address to DB whenever wallet connects
    if (wallet) {
      saveWalletToServer(getWalletAddress(wallet));
    }
  });

  button.addEventListener('click', async () => {
    if (busy) return;
    if (tonConnectUI.wallet) {
      toggleMenu();
      return;
    }

    try {
      busy = true;
      button.disabled = true;
      await tonConnectUI.openModal();
    } catch (err) {
      console.error('Wallet connection failed:', err);
      button.disabled = false;
    } finally {
      busy = false;
    }
  });

  disconnectBtn?.addEventListener('click', async () => {
    try {
      await tonConnectUI.disconnect();
      closeMenu();
    } catch (err) {
      console.error('Wallet disconnect failed:', err);
      alert('Failed to disconnect wallet');
    }
  });

  document.addEventListener('click', (event) => {
    if (menu.classList.contains('hidden')) return;
    if (menu.contains(event.target) || button.contains(event.target)) return;
    closeMenu();
  });
});
