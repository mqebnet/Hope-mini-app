import { fetchUserData, updateTopBar, getCachedUser } from './userData.js';
import { tonConnectUI } from './tonconnect.js';
import { canBootstrap, debounceButton, getTxProof } from './utils.js';
import { i18n } from './i18n.js';

let weeklyEligibilitySnapshot = null;
const WEEKLY_DEFAULT_GOLD_TICKETS = 10;
const WEEKLY_DEFAULT_ENTRY_USD = 0.5;
const PENDING_WEEKLY_TX_KEY = 'pendingWeeklyDropTx';
const PENDING_WEEKLY_TX_MAX_AGE_MS = 30 * 60 * 1000;

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getWeeklyConfig(data = weeklyEligibilitySnapshot || {}) {
  return {
    requiredGoldTickets: Math.max(1, Math.round(parsePositiveNumber(data?.requiredGoldTickets, WEEKLY_DEFAULT_GOLD_TICKETS))),
    entryUsd: parsePositiveNumber(data?.entryUsd, WEEKLY_DEFAULT_ENTRY_USD)
  };
}

function formatUsdAmount(value) {
  const num = parsePositiveNumber(value, WEEKLY_DEFAULT_ENTRY_USD);
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
}

function renderWeeklyRules(config = getWeeklyConfig()) {
  const rule3El = document.getElementById('weekly-rule-3');
  const rule4El = document.getElementById('weekly-rule-4');
  if (rule3El) {
    rule3El.textContent = i18n.format('weekly.rule_3', {
      requiredGoldTickets: config.requiredGoldTickets
    });
  }
  if (rule4El) {
    rule4El.textContent = i18n.format('weekly.rule_4', {
      requiredGoldTickets: config.requiredGoldTickets,
      entryUsd: formatUsdAmount(config.entryUsd)
    });
  }
}

function translateWeeklyEligibilityReason(eligData = {}) {
  const reasonKey = String(eligData.reasonKey || '').trim();
  const params = eligData.reasonParams && typeof eligData.reasonParams === 'object'
    ? eligData.reasonParams
    : {};

  if (reasonKey) {
    const translated = i18n.format(reasonKey, params);
    if (translated && translated !== reasonKey) return translated;
  }
  return i18n.t('weekly.not_eligible');
}

function translateWeeklyEntryError(message = '') {
  const text = String(message || '').trim();
  if (!text) return i18n.t('weekly.entry_failed_generic');
  const weeklyConfig = getWeeklyConfig();

  const lower = text.toLowerCase();
  if (lower.includes('believer')) return i18n.t('weekly.lock_require_level');
  if (lower.includes('streak')) return i18n.format('weekly.lock_require_streak', { current: 0 });
  if (lower.includes('gold')) {
    return i18n.format('weekly.lock_require_gold', {
      current: 0,
      requiredGoldTickets: weeklyConfig.requiredGoldTickets
    });
  }
  if (lower.includes('wallet')) return i18n.t('weekly.lock_require_wallet');
  if (lower.includes('already entered')) {
    const weekMatch = text.match(/entered\s+(.+?)\.?$/i);
    if (weekMatch?.[1]) {
      return i18n.format('weekly.already_entered', { week: weekMatch[1].trim() });
    }
    return i18n.t('weekly.not_eligible');
  }
  return i18n.t('weekly.entry_failed_generic');
}

function savePendingWeeklyTx(txHash, txBoc) {
  try {
    localStorage.setItem(PENDING_WEEKLY_TX_KEY, JSON.stringify({
      txHash: txHash || '',
      txBoc: txBoc || '',
      timestamp: Date.now()
    }));
  } catch (err) {
    console.warn('Failed to persist pending weekly drop transaction:', err);
  }
}

function clearPendingWeeklyTx() {
  try {
    localStorage.removeItem(PENDING_WEEKLY_TX_KEY);
  } catch (err) {
    console.warn('Failed to clear pending weekly drop transaction:', err);
  }
}

function loadPendingWeeklyTx() {
  try {
    const raw = localStorage.getItem(PENDING_WEEKLY_TX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const timestamp = Number(parsed?.timestamp || 0);
    const txHash = typeof parsed?.txHash === 'string' ? parsed.txHash.trim() : '';
    const txBoc = typeof parsed?.txBoc === 'string' ? parsed.txBoc.trim() : '';
    if (!txHash && !txBoc) {
      clearPendingWeeklyTx();
      return null;
    }
    if (!Number.isFinite(timestamp) || Date.now() - timestamp > PENDING_WEEKLY_TX_MAX_AGE_MS) {
      clearPendingWeeklyTx();
      return null;
    }
    return { txHash, txBoc };
  } catch (err) {
    console.warn('Failed to parse pending weekly drop transaction:', err);
    clearPendingWeeklyTx();
    return null;
  }
}

function renderWeeklyEligibilityStatus(statusEl, enterButton, eligData) {
  if (!statusEl || !enterButton || !eligData) return;

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
    statusEl.textContent = translateWeeklyEligibilityReason(eligData);
    return;
  }

  statusEl.textContent = i18n.format('weekly.eligible_status', {
    week: eligData.currentWeek,
    tickets: eligData.goldTickets
  });
}

async function fetchWeeklyEligibility() {
  const eligRes = await fetch('/api/weeklyDrop/eligibility', {
    credentials: 'include',
    cache: 'no-store'
  });
  const eligData = await eligRes.json();
  if (!eligRes.ok) throw new Error(eligData.error || i18n.t('weekly.load_failed'));
  return eligData;
}

async function refreshWeeklyEligibility(statusEl, enterButton, rulesCheckbox) {
  const eligData = await fetchWeeklyEligibility();
  weeklyEligibilitySnapshot = eligData;
  const weeklyConfig = getWeeklyConfig(eligData);
  renderWeeklyRules(weeklyConfig);
  renderWeeklyEligibilityStatus(statusEl, enterButton, eligData);

  if (rulesCheckbox) {
    rulesCheckbox.disabled = Boolean(eligData.disabled || eligData.alreadyEntered || !eligData.eligible);
  }
  if (enterButton) {
    enterButton.disabled = Boolean(
      eligData.disabled ||
      eligData.alreadyEntered ||
      !eligData.eligible ||
      !rulesCheckbox?.checked
    );
  }

  return eligData;
}

function setWeeklyPendingState(statusEl, enterButton, rulesCheckbox) {
  if (statusEl) {
    statusEl.textContent = i18n.t('weekly.verifying_payment');
  }
  if (rulesCheckbox) {
    rulesCheckbox.disabled = true;
  }
  if (enterButton) {
    enterButton.disabled = true;
  }
}

async function retryPendingWeeklyEntry(options = {}) {
  const { notifyOnRetry = false, statusEl = null, enterButton = null, rulesCheckbox = null } = options;
  const pending = loadPendingWeeklyTx();
  if (!pending) return 'none';

  setWeeklyPendingState(statusEl, enterButton, rulesCheckbox);
  try {
    const res = await fetch('/api/weeklyDrop/enter', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash: pending.txHash, txBoc: pending.txBoc })
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      clearPendingWeeklyTx();
      await refreshWeeklyEligibility(statusEl, enterButton, rulesCheckbox);
      return 'resolved';
    }

    const errorMsg = String(data?.error || '').trim();
    const normalized = errorMsg.toLowerCase();
    const alreadyApplied =
      normalized.includes('already entered') ||
      normalized.includes('transaction already used');
    if (alreadyApplied) {
      clearPendingWeeklyTx();
      await refreshWeeklyEligibility(statusEl, enterButton, rulesCheckbox);
      return 'resolved';
    }

    const hardFailure =
      normalized.includes('below required') ||
      normalized.includes('wrong recipient') ||
      normalized.includes('no outgoing payment') ||
      normalized.includes('invalid wallet') ||
      normalized.includes('user not found');
    if (hardFailure) {
      clearPendingWeeklyTx();
      await refreshWeeklyEligibility(statusEl, enterButton, rulesCheckbox);
      if (notifyOnRetry && errorMsg && statusEl) {
        statusEl.textContent = translateWeeklyEntryError(errorMsg);
      }
      return 'failed';
    }

    if (notifyOnRetry && statusEl) {
      statusEl.textContent = i18n.t('weekly.verifying_payment');
    }
    return 'pending';
  } catch (err) {
    console.warn('Pending weekly drop retry failed:', err);
    if (notifyOnRetry && statusEl) {
      statusEl.textContent = i18n.t('weekly.verifying_payment');
    }
    return 'pending';
  }
}

window.addEventListener('hope:languageChanged', () => {
  const statusEl = document.getElementById('eligibility-status');
  const enterButton = document.getElementById('enter-contest-button');
  renderWeeklyRules();
  if (!statusEl || !enterButton || !weeklyEligibilitySnapshot) return;
  renderWeeklyEligibilityStatus(statusEl, enterButton, weeklyEligibilitySnapshot);
});

document.addEventListener('DOMContentLoaded', async () => {
  if (!canBootstrap('weeklydrop')) return;

  const rulesCheckbox = document.getElementById('rules-checkbox');
  const enterButton = document.getElementById('enter-contest-button');
  const statusEl = document.getElementById('eligibility-status');

  try {
    renderWeeklyRules();
    const cached = getCachedUser();
    if (cached) updateTopBar(cached);

    const user = await fetchUserData();
    updateTopBar(user);

    let eligData = await refreshWeeklyEligibility(statusEl, enterButton, rulesCheckbox);
    let weeklyConfig = getWeeklyConfig(eligData);
    if (loadPendingWeeklyTx()) {
      setWeeklyPendingState(statusEl, enterButton, rulesCheckbox);
      const pendingResult = await retryPendingWeeklyEntry({ statusEl, enterButton, rulesCheckbox });
      eligData = weeklyEligibilitySnapshot || eligData;
      weeklyConfig = getWeeklyConfig(eligData);
      if (pendingResult !== 'failed') return;
    }
    if (eligData.disabled || eligData.alreadyEntered || !eligData.eligible) return;

    rulesCheckbox.addEventListener('change', () => {
      enterButton.disabled = !rulesCheckbox.checked;
    });

    enterButton.addEventListener('click', async () => {
      if (!debounceButton(enterButton, 3000)) return;

      try {
        const pendingResult = await retryPendingWeeklyEntry({
          notifyOnRetry: true,
          statusEl,
          enterButton,
          rulesCheckbox
        });
        if (pendingResult !== 'none') {
          return;
        }

        statusEl.textContent = i18n.t('weekly.getting_ton_amount');
        enterButton.disabled = true;

        const priceRes = await fetch(`/api/tonAmount/ton-amount?usd=${encodeURIComponent(weeklyConfig.entryUsd)}`, {
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

        const { txHash, txBoc } = getTxProof(tx, 'weekly-drop');
        if (!txHash && !txBoc) throw new Error(i18n.t('weekly.tx_proof_missing'));
        savePendingWeeklyTx(txHash, txBoc);

        statusEl.textContent = i18n.t('weekly.verifying_payment');

        const res = await fetch('/api/weeklyDrop/enter', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash, txBoc })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(translateWeeklyEntryError(data.error));
        clearPendingWeeklyTx();
        weeklyEligibilitySnapshot = {
          ...weeklyEligibilitySnapshot,
          ...data,
          eligible: false,
          alreadyEntered: true,
          currentWeek: data.week
        };

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
        statusEl.textContent = i18n.format('weekly.entry_failed', {
          error: err?.message || i18n.t('weekly.entry_failed_generic')
        });
      }
    });
  } catch (err) {
    console.error(err);
    statusEl.textContent = i18n.t('weekly.load_failed');
  }
});
