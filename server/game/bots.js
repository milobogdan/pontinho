import { isValidMeld, isValidRun, isValidExtension, canReplaceJoker } from './validator.js';
import {
  firstDraw as doFirstDraw, firstKeepOrDiscard,
  drawFromPile, drawFromDiscard,
  playMeld, extendMeld, stealJoker, discardCard, nextTurn
} from './gameState.js';

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── HELPERS ───────────────────────────────────────────────────────────────────

function getCombinations(arr, size) {
  if (size === 0) return [[]];
  if (arr.length < size) return [];
  const [head, ...tail] = arr;
  return [
    ...getCombinations(tail, size - 1).map(c => [head, ...c]),
    ...getCombinations(tail, size),
  ];
}

// Find the largest valid meld in a hand
function findBestMeld(hand) {
  const max = Math.min(hand.length, 7);
  for (let size = max; size >= 3; size--) {
    for (const combo of getCombinations(hand, size)) {
      if (isValidMeld(combo)) return combo;
    }
  }
  return null;
}

// Find the best meld that includes a specific card
function findMeldWith(hand, card) {
  const others = hand.filter(c => c.id !== card.id);
  const max = Math.min(hand.length, 6);
  for (let size = max; size >= 3; size--) {
    for (const combo of getCombinations(others, size - 1)) {
      const meld = [card, ...combo];
      if (isValidMeld(meld)) return meld;
    }
  }
  return null;
}

// Try to arrange all cards into valid melds (returns array of melds or null)
function findAllMelds(cards) {
  if (cards.length === 0) return [];
  for (let size = Math.min(cards.length, 5); size >= 3; size--) {
    for (const combo of getCombinations(cards, size)) {
      if (isValidMeld(combo)) {
        const remaining = cards.filter(c => !combo.some(m => m.id === c.id));
        const rest = findAllMelds(remaining);
        if (rest !== null) return [combo, ...rest];
      }
    }
  }
  return null;
}

// Check if a hand + one extra card can win (0 or 1 card left to discard)
export function findWinningMelds(hand) {
  // Win by playing all cards
  const all = findAllMelds(hand);
  if (all !== null) return { melds: all, discard: null };

  // Win by playing all except one (which gets discarded)
  for (let i = 0; i < hand.length; i++) {
    const toMeld = hand.filter((_, idx) => idx !== i);
    const melds = findAllMelds(toMeld);
    if (melds !== null) return { melds, discard: hand[i] };
  }

  return null;
}

// Pick the best card to discard (highest value, not a joker, least useful)
function pickDiscardCard(hand, difficulty, melds = []) {
  const nonJokers = hand.filter(c => !c.isJoker);
  if (!nonJokers.length) return null;

  if (difficulty === 'easy') {
    // 15% chance to be smart — avoid discarding a Joker-stealing card
    if (Math.random() < 0.15) {
      const jokerStealers = nonJokers.filter(card =>
        melds.some(m => m.type === 'run' && canReplaceJoker(m.cards, card))
      );
      const safeCandidates = nonJokers.filter(c => !jokerStealers.includes(c));
      const candidates = safeCandidates.length > 0 ? safeCandidates : nonJokers;
      return candidates.sort((a, b) => b.value - a.value)[0];
    }
    // 85% chance: just discard highest value card
    return nonJokers.sort((a, b) => b.value - a.value)[0];
  }

  // Medium/Hard: avoid discarding cards close to melds or that can steal Jokers
  const jokerStealers = nonJokers.filter(card =>
    melds.some(m => m.type === 'run' && canReplaceJoker(m.cards, card))
  );

  const isolated = nonJokers.filter(card => {
    if (jokerStealers.includes(card)) return false;
    return !nonJokers.some(other => {
      if (other.id === card.id) return false;
      return card.rank === other.rank ||
        (card.suit === other.suit && Math.abs(card.value - other.value) <= 2);
    });
  });

  const candidates = isolated.length > 0 ? isolated : 
                     nonJokers.filter(c => !jokerStealers.includes(c)).length > 0 ?
                     nonJokers.filter(c => !jokerStealers.includes(c)) : nonJokers;
  return candidates.sort((a, b) => b.value - a.value)[0];
}

// ── MAIN BOT TURN ─────────────────────────────────────────────────────────────

export async function executeBotTurn(game, botId, difficulty, broadcast) {

  // Thinking delay — feels more natural
  await delay(difficulty === 'hard' ? 1200 : 800);
  if (game.status !== 'playing') return;
  if (game.stopCalledBy) return;

  const bot = () => game.players.find(p => p.id === botId);

  // ── Handle special first turn ────────────────────────────────────────────
  if (game.turnPhase === 'firstDraw') {
    const drawResult = doFirstDraw(game, botId);
    if (drawResult.error) { console.log('Bot firstDraw error:', drawResult.error); return; }
    broadcast();
    await delay(600);
    if (game.status !== 'playing' || game.stopCalledBy) return;

    const drawnCard = bot().hand.at(-1);
    const keep = difficulty === 'easy'
      ? true
      : drawnCard.value <= 7 || drawnCard.isJoker;

    const keepResult = firstKeepOrDiscard(game, botId, keep);
    if (keepResult.error) { console.log('Bot keepOrDiscard error:', keepResult.error); return; }
    broadcast();
    await delay(500);
    if (game.status !== 'playing' || game.stopCalledBy) return;
  }

  // ── Draw phase ───────────────────────────────────────────────────────────
// ── Draw phase ───────────────────────────────────────────────────────────
  if (game.turnPhase === 'draw') {
    const topDiscard = game.discardPile.at(-1);
    let drewFromDiscard = false;

    if (topDiscard && !bot().discardBanned && difficulty !== 'easy') {
      const meld = findMeldWith([...bot().hand, topDiscard], topDiscard);
      if (meld && isValidRun(meld)) {
        const r = drawFromDiscard(game, botId);
        if (!r.error) {
          broadcast();
          drewFromDiscard = true;
          await delay(600);
          if (game.status !== 'playing') return;
          const meldInHand = meld.map(c => bot().hand.find(h => h.id === c.id)).filter(Boolean);
          if (meldInHand.length === meld.length) {
            playMeld(game, botId, meldInHand.map(c => c.id));
            broadcast();
            await delay(500);
            if (game.status !== 'playing') return;
          }
        }
      }
    }

    if (!drewFromDiscard) {
      const r = drawFromPile(game, botId);
      if (r.error) {
        console.log('⚠️ Bot draw failed:', r.error);
        return; // can't draw, end bot turn gracefully
      }
      broadcast();
      await delay(600);
      if (game.status !== 'playing') return;
    }
  }

  // ── Play phase — lay down melds ──────────────────────────────────────────
  if (game.turnPhase === 'play') {
    let keepPlaying = true;
    let meldsThisTurn = 0;
    const meldLimit = difficulty === 'easy' ? 1 : 10;

    while (keepPlaying && meldsThisTurn < meldLimit && bot().hand.length > 1) {
      // Easy bot: only 40% chance to play each meld
      if (difficulty === 'easy' && Math.random() > 0.4) break;

      const meld = findBestMeld(bot().hand);
      if (!meld) break;

      const result = playMeld(game, botId, meld.map(c => c.id));
      if (result.error) break;
      broadcast();
      meldsThisTurn++;
      await delay(500);
      if (game.status !== 'playing') return;
    }

    // Medium/Hard: try extending melds on the table
    if (difficulty !== 'easy') {
      for (const meld of game.melds) {
        if (bot().hand.length <= 1) break;
        for (const card of [...bot().hand]) {
          if (card.isJoker) continue;
          const result = extendMeld(game, botId, meld.id, [card.id]);
          if (!result.error) {
            broadcast();
            await delay(400);
            if (game.status !== 'playing') return;
            break;
          }
        }
      }
    }
  }

// ── Steal Jokers (medium/hard only) ─────────────────────────────────────
    // Easy: 15% chance | Medium/Hard: always
  if (game.turnPhase === 'play' && 
      (difficulty !== 'easy' || Math.random() < 0.15)) {
    for (const meld of game.melds) {
      if (bot().hand.length <= 1) break;
      if (meld.type !== 'run') continue;
      if (!meld.cards.some(c => c.isJoker)) continue;

      for (const card of [...bot().hand]) {
        if (card.isJoker) continue;
        if (canReplaceJoker(meld.cards, card)) {
          const result = stealJoker(game, botId, meld.id, card.id);
          if (!result.error) {
            broadcast();
            await delay(500);
            if (game.status !== 'playing') return;

            // Now try to use the stolen Joker in a new meld
            const newMeld = findBestMeld(bot().hand);
            if (newMeld) {
              playMeld(game, botId, newMeld.map(c => c.id));
              broadcast();
              await delay(400);
              if (game.status !== 'playing') return;
            }
            break;
          }
        }
      }
    }
  }

  // ── Discard to end turn ──────────────────────────────────────────────────
  if (game.turnPhase === 'play' && bot().hand.length > 0) {
    let card = pickDiscardCard(bot().hand, difficulty, game.melds);

    // Edge case: only Jokers left — try to use one in a meld first
    if (!card) {
      const joker = bot().hand.find(c => c.isJoker);
      if (joker) {
        for (const meld of game.melds) {
          if (meld.type === 'run') {
            const r = extendMeld(game, botId, meld.id, [joker.id]);
            if (!r.error) { broadcast(); await delay(400); break; }
          }
        }
        card = pickDiscardCard(bot().hand, difficulty, game.melds);
      }
    }

    if (card) {
      discardCard(game, botId, card.id);
      broadcast();
    } else {
      console.log('⚠️ Bot truly stuck with only Jokers, skipping turn');
      nextTurn(game); // force advance to prevent infinite loop
      broadcast();
    }
  }
}