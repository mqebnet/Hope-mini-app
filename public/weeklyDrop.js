import { fetchUserData, updateTopBar, getCachedUser } from './userData.js';
import { tonConnectUI } from './tonconnect.js';
import { canBootstrap, debounceButton } from './utils.js';
import { i18n } from './i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
  if (!canBootstrap('weeklydrop')) return;

  const rulesCheckbox = document.getElementById('rules-checkbox');
  const enterButton = document.getElementById('enter-contest-button');
  const statusEl = document.getElementById('eligibility-status');

  try {
    const cached = getCachedUser();
    if (cached) updateTopBar(cached);

    const user = await fetchUserData();
    updateTopBar(user);

    const eligRes = await fetch('/api/weeklyDrop/eligibility', {
      credentials: 'include'
    });
    const eligData = await eligRes.json();

    if (eligData.disabled) {
      statusEl.textContent = i18n.t('weekly.disabled_status');
      return;
    }

    if (eligData.alreadyEntered) {
      statusEl.textContent = i18n.format('weekly.already_entered', { week: eligData.currentWeek });
      enterButton.disabled = true;
      return;
    }

    if (!eligData.eligible) {
      statusEl.textContent = eligData.reason || i18n.t('weekly.not_eligible');
      return;
    }

    statusEl.textContent = i18n.format('weekly.eligible_status', {
      week: eligData.currentWeek,
      tickets: eligData.goldTickets
    });

    rulesCheckbox.addEventListener('change', () => {
      enterButton.disabled = !rulesCheckbox.checked;
    });

    enterButton.addEventListener('click', async () => {
      if (!debounceButton(enterButton, 3000)) return;

      try {
        statusEl.textContent = i18n.t('weekly.getting_ton_amount');
        enterButton.disabled = true;

        const priceRes = await fetch('/api/tonAmount/ton-amount?usd=0.5', {
          credentials: 'include'
        });
        if (!priceRes.ok) throw new Error(i18n.t('weekly.ton_amount_failed'));
        const { tonAmount, recipientAddress } = await priceRes.json();
        if (!recipientAddress) throw new Error(i18n.t('weekly.recipient_not_configured'));
        if (!tonAmount || tonAmount <= 0) throw new Error(i18n.t('weekly.invalid_ton_amount'));

        statusEl.textContent = i18n.t('weekly.waiting_wallet');

        const tx = await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 300,
          messages: [{
            address: recipientAddress,
            amount: (tonAmount * 1e9).toFixed(0)
          }]
        });

        const txHash = tx?.transaction?.hash
          || tx?.txid?.hash
          || tx?.hash
          || '';
        const txBoc = tx?.boc || '';

        if (!txHash && !txBoc) {
          throw new Error(i18n.t('weekly.tx_proof_missing'));
        }

        statusEl.textContent = i18n.t('weekly.verifying_payment');

        const res = await fetch('/api/weeklyDrop/enter', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash, txBoc })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || i18n.t('weekly.entry_failed_generic'));

        statusEl.textContent = i18n.format('weekly.entry_success', {
          week: data.week,
          message: data.message,
          tickets: data.goldTickets
        });
        enterButton.disabled = true;
        rulesCheckbox.disabled = true;
      } catch (err) {
        console.error('Weekly drop entry error:', err);
        enterButton.disabled = !rulesCheckbox.checked;
        statusEl.textContent = i18n.format('weekly.entry_failed', { error: err.message });
      }
    });
  } catch (err) {
    console.error(err);
    statusEl.textContent = i18n.t('weekly.load_failed');
  }
});
