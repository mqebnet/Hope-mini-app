// public/connectWallet.js
import { tonConnectUI } from './tonconnect.js';
import { i18n } from './i18n.js';
import { toUserFriendlyAddress } from 'https://esm.sh/@tonconnect/sdk@3.1.0';

document.addEventListener('DOMContentLoaded', async () => {
  const button = document.getElementById('ton-connect-button');
  const topNav = document.getElementById('top-nav');
  if (!button || !topNav) return;

  let busy = false;
  const MAINNET_CHAIN = '-239';
  const TESTNET_CHAIN = '-3';
  const PREFERRED_WALLETS = [
    { appName: 'telegram-wallet', label: 'Telegram Wallet' },
    { appName: 'tonkeeper', label: 'Tonkeeper' },
    { appName: 'mytonwallet', label: 'MyTonWallet' },
    { appName: 'okxTonWallet', label: 'OKX Wallet' }
  ];

  const menu = document.createElement('div');
  menu.id = 'wallet-popover';
  menu.className = 'hidden';
  menu.innerHTML = `
    <p class="wallet-popover-title">${i18n.t('wallet.connected_wallet')}</p>
    <p id="wallet-address" class="wallet-popover-address">-</p>
    <button id="wallet-disconnect-btn" class="wallet-disconnect-btn">${i18n.t('wallet.disconnect')}</button>
  `;
  document.body.appendChild(menu);

  const walletPicker = document.createElement('div');
  walletPicker.id = 'wallet-picker';
  walletPicker.className = 'hidden';
  walletPicker.innerHTML = `
    <p class="wallet-popover-title">${i18n.t('wallet.choose_wallet')}</p>
    <div class="wallet-picker-list">
      ${PREFERRED_WALLETS.map((wallet) => `
        <button type="button" class="wallet-picker-btn" data-wallet-app="${wallet.appName}">
          ${wallet.label}
        </button>
      `).join('')}
    </div>
  `;
  document.body.appendChild(walletPicker);

  const addressEl = menu.querySelector('#wallet-address');
  const disconnectBtn = menu.querySelector('#wallet-disconnect-btn');
  const titleEl = menu.querySelector('.wallet-popover-title');
  const pickerTitleEl = walletPicker.querySelector('.wallet-popover-title');
  const pickerButtons = Array.from(walletPicker.querySelectorAll('.wallet-picker-btn'));

  const getWalletChain = (wallet) => wallet?.account?.chain || wallet?.chain || null;
  const getWalletAddress = (wallet) => {
    const raw = wallet?.account?.address || '';
    if (!raw) return '';
    try {
      if (raw.includes(':')) {
        return toUserFriendlyAddress(raw, getWalletChain(wallet) === TESTNET_CHAIN);
      }
    } catch (_) {
      // Fallback to the raw format if conversion fails for any reason.
    }
    return raw;
  };

  const shortAddress = (address) => {
    if (!address || address.length < 13) return address || '-';
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  };

  const closeMenu = () => menu.classList.add('hidden');
  const closeWalletPicker = () => walletPicker.classList.add('hidden');
  const positionPopover = (panel) => {
    if (!panel || panel.classList.contains('hidden')) return;

    const buttonRect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 8;
    const sidePadding = 10;

    let top = buttonRect.bottom + gap;
    let left = buttonRect.right - panelRect.width;

    const minLeft = sidePadding;
    const maxLeft = Math.max(sidePadding, viewportWidth - panelRect.width - sidePadding);
    left = Math.min(Math.max(left, minLeft), maxLeft);

    const maxTop = Math.max(gap, viewportHeight - panelRect.height - gap);
    top = Math.min(top, maxTop);

    panel.style.top = `${Math.max(gap, top)}px`;
    panel.style.left = `${left}px`;
  };
  const positionWalletPanels = () => {
    positionPopover(menu);
    positionPopover(walletPicker);
  };
  const toggleMenu = () => {
    closeWalletPicker();
    menu.classList.toggle('hidden');
    positionWalletPanels();
  };
  const toggleWalletPicker = () => {
    closeMenu();
    walletPicker.classList.toggle('hidden');
    positionWalletPanels();
  };

  const updateMenuText = () => {
    if (titleEl) titleEl.textContent = i18n.t('wallet.connected_wallet');
    if (disconnectBtn) disconnectBtn.textContent = i18n.t('wallet.disconnect');
    if (pickerTitleEl) pickerTitleEl.textContent = i18n.t('wallet.choose_wallet');
  };

  const updateMenu = (wallet) => {
    updateMenuText();
    const fullAddress = getWalletAddress(wallet);
    if (!fullAddress) {
      addressEl.textContent = '-';
      addressEl.removeAttribute('title');
      closeMenu();
      return;
    }
    addressEl.textContent = shortAddress(fullAddress);
    addressEl.title = fullAddress;
    positionWalletPanels();
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
      button.innerHTML = `<i data-lucide="wallet"></i> ${i18n.t('wallet.connected')}`;
      button.classList.add('connected');
    } else {
      button.innerHTML = `<i data-lucide="wallet"></i> ${i18n.t('wallet.connect_wallet')}`;
      button.classList.remove('connected');
    }
    button.disabled = false;
    if (window.lucide) lucide.createIcons();
  };

  const disconnectNonMainnetWallet = async (wallet) => {
    if (!wallet) return false;
    const chain = getWalletChain(wallet);
    if (chain === MAINNET_CHAIN) return false;

    alert(i18n.t('wallet.switch_mainnet'));
    if (chain && chain !== TESTNET_CHAIN) {
      console.warn(`Blocked non-mainnet wallet chain: ${chain}`);
    } else if (!chain) {
      console.warn('Blocked wallet with unknown chain:', wallet);
    }

    try {
      await tonConnectUI.disconnect();
    } catch (err) {
      console.warn('Failed to disconnect non-mainnet wallet:', err);
    }

    updateUI(null);
    updateMenu(null);
    closeWalletPicker();
    return true;
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

  const restoredWallet = tonConnectUI.wallet;
  if (await disconnectNonMainnetWallet(restoredWallet)) {
    updateUI(null);
    updateMenu(null);
    } else {
      updateUI(restoredWallet);
      updateMenu(restoredWallet);
      positionWalletPanels();
    }

  if (tonConnectUI.wallet && getWalletChain(tonConnectUI.wallet) === MAINNET_CHAIN) {
    saveWalletToServer(getWalletAddress(tonConnectUI.wallet));
  }

  window.addEventListener('hope:languageChanged', () => {
    updateUI(tonConnectUI.wallet);
    updateMenu(tonConnectUI.wallet);
  });

  tonConnectUI.onStatusChange((wallet) => {
    const chain = getWalletChain(wallet);
    if (wallet && chain !== MAINNET_CHAIN) {
      disconnectNonMainnetWallet(wallet);
      return;
    }

    updateUI(wallet);
    updateMenu(wallet);
    closeWalletPicker();
    positionWalletPanels();

    if (wallet) {
      saveWalletToServer(getWalletAddress(wallet));
    }
  });

  button.addEventListener('click', () => {
    if (busy) return;
    if (tonConnectUI.wallet) {
      toggleMenu();
      return;
    }
    toggleWalletPicker();
  });

  pickerButtons.forEach((pickerButton) => {
    pickerButton.addEventListener('click', async () => {
      const walletApp = pickerButton.dataset.walletApp;
      if (!walletApp || busy) return;

      try {
        busy = true;
        button.disabled = true;
        closeWalletPicker();

        if (typeof tonConnectUI.openSingleWalletModal === 'function') {
          await tonConnectUI.openSingleWalletModal(walletApp);
        } else {
          await tonConnectUI.openModal();
        }
      } catch (err) {
        console.error('Wallet connection failed:', err);
        alert(i18n.t('wallet.open_wallet_failed'));
      } finally {
        busy = false;
        button.disabled = false;
      }
    });
  });

  disconnectBtn?.addEventListener('click', async () => {
    try {
      await tonConnectUI.disconnect();
      closeMenu();
    } catch (err) {
      console.error('Wallet disconnect failed:', err);
      alert(i18n.t('wallet.disconnect_failed'));
    }
  });

  document.addEventListener('click', (event) => {
    if (!menu.classList.contains('hidden')) {
      if (!menu.contains(event.target) && !button.contains(event.target)) {
        closeMenu();
      }
    }

    if (!walletPicker.classList.contains('hidden')) {
      if (!walletPicker.contains(event.target) && !button.contains(event.target)) {
        closeWalletPicker();
      }
    }
  });

  window.addEventListener('resize', positionWalletPanels);
  window.addEventListener('scroll', positionWalletPanels, { passive: true });
});
