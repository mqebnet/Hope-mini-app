import { fetchUserData, updateTopBar } from './userData.js';
import { tonConnectUI } from './tonconnect.js';

const PUZZLE_PIECES = 10;
const PUZZLE_COLS = 5;
const PUZZLE_ROWS = 2;

let user = null;
let selectedTradeAmount = null;
let selectedTradeType = null;
let currentPuzzle = null;
let puzzleTimer = null;
let timeLeft = 60;
let puzzleSolved = false;

const mysteryBtn = document.getElementById('open-market-mystery-box-button');
const mysteryInfo = document.getElementById('mystery-box-info');
const claimBtn = document.getElementById('claim-mystery-reward-button');
const mysteryTrack = document.getElementById('mystery-box-track');

const puzzleGame = document.getElementById('puzzle-game');
const puzzleBoard = document.getElementById('puzzle-board');
const puzzlePieces = document.getElementById('puzzle-pieces');
const puzzleTimerEl = document.getElementById('puzzle-timer');
const referenceImage = document.getElementById('reference-image');
const puzzleCloseBtn = document.getElementById('puzzle-close-button');
const puzzleClaimBtn = document.getElementById('puzzle-claim-button');

let cachedBoxStatus = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (window.Telegram?.WebApp) window.Telegram.WebApp.ready();

  try {
    user = await fetchUserData();
    updateTopBar(user);
  } catch (err) {
    console.error('Failed to load user:', err);
    showNotification('Failed to load user', 'error');
    return;
  }

  initMarketplaceTabs();
  initExchangeUI();
  initMysteryBoxes();
  await refreshMysteryStatus();
});

function initMarketplaceTabs() {
  const tabs = document.querySelectorAll('.market-tab');
  const sections = {
    puzzles: document.getElementById('puzzles-section'),
    exchange: document.getElementById('exchange-section')
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      Object.entries(sections).forEach(([key, section]) => {
        if (section) section.classList.toggle('active', key === target);
      });
    });
  });
}

function updateExchangePreview(tradeType, amount) {
  const exchangeRates = { bronze: 1, silver: 1 };
  const rate = exchangeRates[tradeType] || 1;
  const toAmount = Math.floor(amount * rate);
  const fromLabel = tradeType === 'bronze' ? 'Bronze' : 'Silver';
  const toLabel = tradeType === 'bronze' ? 'Silver' : 'Gold';

  const fromDiv = document.getElementById('from-ticket');
  const toDiv = document.getElementById('to-ticket');
  if (fromDiv) fromDiv.textContent = `${amount} ${fromLabel}`;
  if (toDiv) toDiv.textContent = `${toAmount} ${toLabel}`;
}

function initExchangeUI() {
  const typeSelect = document.getElementById('exchange-type');
  const amountButtons = document.querySelectorAll('.amount-option');
  const tradeBtn = document.getElementById('trade-button');
  tradeBtn.disabled = true;

  function refreshAvailability() {
    amountButtons.forEach((btn) => {
      const amount = Number.parseInt(btn.dataset.amount, 10);
      const type = typeSelect.value;
      const balance = type === 'bronze' ? user.bronzeTickets : user.silverTickets;
      btn.disabled = balance < amount;
      btn.classList.toggle('disabled', balance < amount);
    });
  }

  refreshAvailability();

  typeSelect.addEventListener('change', () => {
    selectedTradeAmount = null;
    tradeBtn.disabled = true;
    const fromDiv = document.getElementById('from-ticket');
    const toDiv = document.getElementById('to-ticket');
    if (fromDiv) fromDiv.textContent = '';
    if (toDiv) toDiv.textContent = '';
    refreshAvailability();
  });

  amountButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) {
        showNotification('Not enough tickets', 'info');
        return;
      }
      selectedTradeAmount = Number.parseInt(btn.dataset.amount, 10);
      selectedTradeType = typeSelect.value;
      tradeBtn.disabled = false;
      updateExchangePreview(selectedTradeType, selectedTradeAmount);
    });
  });

  tradeBtn.addEventListener('click', async () => {
    if (!selectedTradeAmount) return;
    try {
      if (!tonConnectUI.wallet) throw new Error('Please connect your wallet first');
      const res = await fetch('/api/exchangeTickets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromType: selectedTradeType,
          quantity: selectedTradeAmount / 100
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trade failed');

      user = await fetchUserData();
      updateTopBar(user);
      refreshAvailability();
      tradeBtn.disabled = true;
      showNotification('Trade successful!', 'success');
    } catch (err) {
      showNotification(err.message || 'Trade failed', 'error');
    }
  });
}

async function fetchMysteryStatus() {
  const res = await fetch('/api/mysteryBox/status', { credentials: 'include', cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load mystery box status');
  return data;
}

function renderMysteryStatus(status) {
  cachedBoxStatus = status;
  if (!mysteryBtn || !mysteryInfo) return;

  const purchasedToday = status.purchasedToday || 0;
  const limit = status.limit || 3;
  const nextBox = status.nextBoxType;
  const activeBox = status.activeBox;
  const todayBoxes = status.todayBoxes || [];

  const label = activeBox
    ? `Open ${activeBox.boxType.toUpperCase()} Box`
    : nextBox
      ? `Get ${nextBox.toUpperCase()} Mystery Box`
      : 'Daily Limit Reached';

  mysteryBtn.textContent = label;
  mysteryBtn.disabled = !activeBox && !nextBox;

  const progressLabel = `${purchasedToday}/${limit} purchased today`;
  const nextLabel = nextBox ? `Next box: ${nextBox}` : 'All 3 boxes purchased today';
  mysteryInfo.innerHTML = `
    <p>${progressLabel}</p>
    <p>${nextLabel}</p>
    <p>Each box costs 0.1 USDT in TON</p>
  `;

  if (mysteryTrack) {
    const statusMap = new Map(todayBoxes.map((b) => [b.boxType, b.status]));
    mysteryTrack.innerHTML = '';
    ['bronze', 'silver', 'gold'].forEach((boxType) => {
      const card = document.createElement('div');
      const recorded = statusMap.get(boxType);
      let state = 'locked';
      if (recorded === 'claimed') state = 'claimed';
      else if (recorded === 'opened') state = 'opened';
      else if (recorded === 'purchased') state = 'ready';
      else if (nextBox === boxType) state = 'next';

      card.className = `box-card ${boxType} ${state}`;
      card.innerHTML = `
        <span class="box-title">${boxType.toUpperCase()}</span>
        <span class="box-state">${state.toUpperCase()}</span>
      `;
      mysteryTrack.appendChild(card);
    });
  }
}

async function refreshMysteryStatus() {
  try {
    const status = await fetchMysteryStatus();
    renderMysteryStatus(status);
  } catch (err) {
    showNotification(err.message || 'Failed to load mystery status', 'error');
  }
}

function initMysteryBoxes() {
  if (mysteryBtn) {
    mysteryBtn.addEventListener('click', async () => {
      try {
        if (cachedBoxStatus?.activeBox) {
          await openPuzzleFromBackend();
          return;
        }
        await purchaseMysteryBox();
      } catch (err) {
        showNotification(err.message || 'Mystery box action failed', 'error');
      }
    });
  }

  if (claimBtn) {
    claimBtn.addEventListener('click', async () => {
      await claimPuzzleReward();
    });
  }

  if (puzzleClaimBtn) {
    puzzleClaimBtn.addEventListener('click', async () => {
      await claimPuzzleReward();
    });
  }

  if (puzzleCloseBtn) {
    puzzleCloseBtn.addEventListener('click', () => {
      closePuzzle(false);
    });
  }
}

async function purchaseMysteryBox() {
  if (!tonConnectUI.wallet) throw new Error('Please connect your wallet first');

  const amountRes = await fetch('/api/tonAmount/ton-amount?usd=0.1', { credentials: 'include' });
  const amountData = await amountRes.json();
  if (!amountRes.ok) throw new Error(amountData.error || 'Failed to get TON amount');

  const { tonAmount, recipientAddress } = amountData;
  if (!recipientAddress) throw new Error('Payment recipient not configured');
  if (typeof tonAmount !== 'number' || tonAmount <= 0) throw new Error('Invalid TON amount');

  const tx = await tonConnectUI.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [{ address: recipientAddress, amount: (tonAmount * 1e9).toFixed(0) }]
  });
  if (!tx?.boc) throw new Error('Transaction rejected');

  const purchaseRes = await fetch('/api/mysteryBox/purchase', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash: tx.boc })
  });
  const purchaseData = await purchaseRes.json();
  if (!purchaseRes.ok) throw new Error(purchaseData.error || 'Purchase failed');

  showNotification(`${purchaseData.boxType.toUpperCase()} box purchased. Click to open.`, 'success');
  await refreshMysteryStatus();
}

async function openPuzzleFromBackend() {
  const openRes = await fetch('/api/mysteryBox/open', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  });
  const openData = await openRes.json();
  if (!openRes.ok) throw new Error(openData.error || 'Failed to open box');

  currentPuzzle = openData;
  launchPuzzleGame(openData);
}

function createPieceEl(pieceDef, imageUrl) {
  const sourceIndex = Number(pieceDef.sourceIndex);
  const col = sourceIndex % PUZZLE_COLS;
  const row = Math.floor(sourceIndex / PUZZLE_COLS);
  const piece = document.createElement('div');
  piece.className = 'market-puzzle-piece';
  piece.draggable = true;
  piece.dataset.piece = String(pieceDef.pieceId);
  piece.style.backgroundImage = `url(${imageUrl})`;
  piece.style.backgroundSize = `${PUZZLE_COLS * 100}% ${PUZZLE_ROWS * 100}%`;
  piece.style.backgroundPosition = `${(col / (PUZZLE_COLS - 1)) * 100}% ${(row / (PUZZLE_ROWS - 1)) * 100}%`;
  piece.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('pieceIndex', piece.dataset.piece);
  });
  return piece;
}

function launchPuzzleGame(data) {
  puzzleSolved = false;
  timeLeft = Number(data.timerSeconds) || 60;
  if (puzzleTimerEl) puzzleTimerEl.textContent = formatTimer(timeLeft);
  if (referenceImage) {
    referenceImage.style.backgroundImage = `url(${data.puzzle.imageUrl})`;
  }
  if (claimBtn) claimBtn.classList.add('hidden');
  if (puzzleClaimBtn) puzzleClaimBtn.classList.add('hidden');

  puzzleBoard.innerHTML = '';
  puzzlePieces.innerHTML = '';

  const pieces = Array.isArray(data.puzzle.pieces) ? data.puzzle.pieces : [];
  if (pieces.length !== PUZZLE_PIECES) {
    throw new Error('Invalid puzzle data');
  }

  for (let i = 0; i < PUZZLE_PIECES; i += 1) {
    const slot = document.createElement('div');
    slot.className = 'market-puzzle-slot';
    slot.dataset.slot = String(i);

    slot.addEventListener('dragover', (e) => e.preventDefault());
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      const pieceIndex = e.dataTransfer.getData('pieceIndex');
      if (!pieceIndex) return;
      placePieceInSlot(pieceIndex, slot, data.puzzle.imageUrl);
      checkPuzzleSolved();
    });
    puzzleBoard.appendChild(slot);
  }

  puzzlePieces.ondragover = (e) => e.preventDefault();
  puzzlePieces.ondrop = (e) => {
    e.preventDefault();
    const pieceIndex = e.dataTransfer.getData('pieceIndex');
    if (!pieceIndex) return;
    movePieceToPool(pieceIndex, data.puzzle.imageUrl);
  };

  pieces.forEach((piece) => {
    puzzlePieces.appendChild(createPieceEl(piece, data.puzzle.imageUrl));
  });

  puzzleGame.classList.remove('hidden');
  startPuzzleTimer();
}

function placePieceInSlot(pieceId, slot, imageUrl) {
  const descriptor = currentPuzzle?.puzzle?.pieces?.find((p) => p.pieceId === pieceId);
  if (!descriptor) return;
  const draggedPiece = document.querySelector(`.market-puzzle-piece[data-piece="${pieceId}"]`);
  if (!draggedPiece) return;

  const existing = slot.querySelector('.market-puzzle-piece');
  if (existing) {
    const existingDescriptor = currentPuzzle?.puzzle?.pieces?.find((p) => p.pieceId === existing.dataset.piece);
    if (existingDescriptor) {
      puzzlePieces.appendChild(createPieceEl(existingDescriptor, imageUrl));
    }
    existing.remove();
  }

  const currentParent = draggedPiece.parentElement;
  if (currentParent && currentParent.classList.contains('market-puzzle-slot')) {
    draggedPiece.remove();
  } else if (currentParent) {
    draggedPiece.remove();
  }

  const placedPiece = createPieceEl(descriptor, imageUrl);
  placedPiece.draggable = true;
  slot.appendChild(placedPiece);
}

function movePieceToPool(pieceId, imageUrl) {
  const descriptor = currentPuzzle?.puzzle?.pieces?.find((p) => p.pieceId === pieceId);
  if (!descriptor) return;
  const pieceEl = document.querySelector(`.market-puzzle-piece[data-piece="${pieceId}"]`);
  if (!pieceEl) return;
  const parent = pieceEl.parentElement;
  if (parent && parent.classList.contains('market-puzzle-slot')) {
    pieceEl.remove();
    puzzlePieces.appendChild(createPieceEl(descriptor, imageUrl));
  }
}

function getCurrentArrangement() {
  const arrangement = [];
  const slots = puzzleBoard.querySelectorAll('.market-puzzle-slot');
  slots.forEach((slot) => {
    const piece = slot.querySelector('.market-puzzle-piece');
    arrangement.push(piece ? piece.dataset.piece : '');
  });
  return arrangement;
}

async function checkPuzzleSolved() {
  const arrangement = getCurrentArrangement();
  if (arrangement.some((pieceId) => !pieceId)) return;
  const solved = arrangement.every(Boolean);
  if (!solved || puzzleSolved) return;

  try {
    const res = await fetch('/api/mysteryBox/solve', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arrangement, sessionId: currentPuzzle?.puzzle?.sessionId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Puzzle verification failed');

    puzzleSolved = true;
    clearInterval(puzzleTimer);
    showConfetti();
    showNotification('Congratulations! Puzzle solved.', 'success');
    if (claimBtn) claimBtn.classList.remove('hidden');
    if (puzzleClaimBtn) puzzleClaimBtn.classList.remove('hidden');
  } catch (err) {
    showNotification(err.message || 'Failed to verify puzzle solve', 'error');
  }
}

function startPuzzleTimer() {
  clearInterval(puzzleTimer);
  puzzleTimer = setInterval(() => {
    timeLeft -= 1;
    if (puzzleTimerEl) puzzleTimerEl.textContent = formatTimer(Math.max(timeLeft, 0));
    if (timeLeft <= 0) {
      clearInterval(puzzleTimer);
      if (!puzzleSolved) {
        closePuzzle(false);
        showNotification('Unlucky! Try again?', 'error');
      }
    }
  }, 1000);
}

function closePuzzle(success) {
  clearInterval(puzzleTimer);
  puzzleGame.classList.add('hidden');
  if (!success) {
    if (claimBtn) claimBtn.classList.add('hidden');
    if (puzzleClaimBtn) puzzleClaimBtn.classList.add('hidden');
  }
}

async function claimPuzzleReward() {
  try {
    const res = await fetch('/api/mysteryBox/claim', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Claim failed');

    user = await fetchUserData();
    updateTopBar(user);
    closePuzzle(true);
    if (claimBtn) claimBtn.classList.add('hidden');
    if (puzzleClaimBtn) puzzleClaimBtn.classList.add('hidden');
    showNotification('Rewards claimed!', 'success');
    await refreshMysteryStatus();
  } catch (err) {
    showNotification(err.message || 'Claim failed', 'error');
  }
}

function formatTimer(seconds) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function showNotification(message, type = 'info') {
  if (typeof window.showSuccessToast === 'function' && type === 'success') {
    window.showSuccessToast(message);
    return;
  }
  if (typeof window.showErrorToast === 'function' && type === 'error') {
    window.showErrorToast(message);
    return;
  }
  if (typeof window.showWarningToast === 'function' && type === 'warn') {
    window.showWarningToast(message);
    return;
  }
  alert(message);
}

function showConfetti() {
  if (typeof confetti !== 'function') return;
  confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } });
}
