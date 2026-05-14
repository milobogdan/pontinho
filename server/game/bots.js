import { isValidMeld, isValidRun, isValidWinningRun, isValidExtension, canReplaceJoker } from './validator.js';
import {
  firstDraw as doFirstDraw, firstKeepOrDiscard,
  drawFromPile, drawFromDiscard,
  playMeld, extendMeld, stealJoker, discardCard, nextTurn
} from './gameState.js';

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── COMBINATORICS ─────────────────────────────────────────────────────────────

function getCombinations(arr, size) {
  if (size === 0) return [[]];
  if (arr.length < size) return [];
  const [head, ...tail] = arr;
  return [
    ...getCombinations(tail, size - 1).map(c => [head, ...c]),
    ...getCombinations(tail, size),
  ];
}

// ── MELD FINDERS ─────────────────────────────────────────────────────────────

function findBestMeld(hand) {
  const max = Math.min(hand.length, 7);
  for (let size = max; size >= 3; size--) {
    for (const combo of getCombinations(hand, size)) {
      if (isValidMeld(combo)) return combo;
    }
  }
  return null;
}

function findMeldWith(hand, card) {
  if (!card) return null;
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

// Finds all melds that can partition the cards (uses winning run rules for going-out detection)
function findAllMelds(cards, useWinningRules = false) {
  if (cards.length === 0) return [];
  const isValid = (combo) => isValidMeld(combo) || (useWinningRules && isValidWinningRun(combo));
  for (let size = Math.min(cards.length, 7); size >= 3; size--) {
    for (const combo of getCombinations(cards, size)) {
      if (isValid(combo)) {
        const remaining = cards.filter(c => !combo.some(m => m.id === c.id));
        const rest = findAllMelds(remaining, useWinningRules);
        if (rest !== null) return [combo, ...rest];
      }
    }
  }
  return null;
}

// Exported — used by checkBotStop in index.js (winning rules: Joker at start/end allowed)
export function findWinningMelds(hand) {
  const all = findAllMelds(hand, true);
  if (all !== null) return { melds: all, discard: null };

  for (let i = 0; i < hand.length; i++) {
    const toMeld = hand.filter((_, idx) => idx !== i);
    const melds = findAllMelds(toMeld, true);
    if (melds !== null) return { melds, discard: hand[i] };
  }

  return null;
}

// ── THREAT LEVEL ──────────────────────────────────────────────────────────────

function getThreatLevel(game, botId) {
  const opponents = game.players.filter(p => p.id !== botId && !p.eliminated && !p.isDisconnected);
  if (!opponents.length) return 'low';
  const minCards = Math.min(...opponents.map(p => (p.hand || []).length));
  if (minCards <= 1) return 'critical';
  if (minCards <= 3) return 'high';
  if (minCards <= 6) return 'medium';
  return 'low';
}

// ── JOKER HELPERS ─────────────────────────────────────────────────────────────

// Try to slot bot's Joker into an existing table run (no Joker already in it)
async function trySlotJokerIntoRun(game, botId, broadcast) {
  const bot = game.players.find(p => p.id === botId);
  const joker = bot.hand.find(c => c.isJoker);
  if (!joker) return false;

  for (const meld of game.melds) {
    if (meld.type !== 'run') continue;
    if (meld.cards.some(c => c.isJoker)) continue;
    const result = extendMeld(game, botId, meld.id, [joker.id]);
    if (!result.error) {
      broadcast();
      await delay(400);
      return true;
    }
  }
  return false;
}

// ── SCORE GUARD ───────────────────────────────────────────────────────────────

// Hard bots near 200 should hold melds and try to win outright
function shouldHoldCards(botScore, threat) {
  if (botScore >= 185) return true;
  return false;
}

// ── SMART DISCARD ─────────────────────────────────────────────────────────────

// Returns a usefulness score — higher = keep it, lower = good discard candidate
function cardUsefulness(card, hand, melds) {
  if (card.isJoker) return Infinity;

  // Can replace a Joker on the table? Very valuable.
  if (melds.some(m => m.type === 'run' && canReplaceJoker(m.cards, card))) return Infinity;

  const others = hand.filter(c => c.id !== card.id && !c.isJoker);

  // Part of a potential run in hand (adjacent same-suit cards within 2)
  const sameSuit = others.filter(c => c.suit === card.suit);
  for (const other of sameSuit) {
    const diff = Math.abs(card.value - other.value);
    if (diff === 1) return card.value + 60; // adjacent — strong run potential
    if (diff === 2) return card.value + 40; // one gap — Joker could fill it
  }

  // Same rank as another hand card (potential set)
  const sameRank = others.filter(c => c.rank === card.rank);
  if (sameRank.length >= 2) return card.value + 50; // three-of-a-kind possible
  if (sameRank.length === 1) return card.value + 25; // pair — one more needed

  // Isolated card — penalise by its score value (high value = worse to keep)
  return -card.value;
}

function pickDiscardCard(hand, difficulty, melds = [], threat = 'low') {
  const nonJokers = hand.filter(c => !c.isJoker);
  if (!nonJokers.length) return null;

  if (difficulty === 'easy') {
    // Mostly random; 15% chance to at least dump the highest card
    return Math.random() < 0.85
      ? nonJokers[Math.floor(Math.random() * nonJokers.length)]
      : nonJokers.sort((a, b) => b.value - a.value)[0];
  }

  // Medium / Hard: score each card, discard the least useful
  const scored = nonJokers.map(card => ({
    card,
    score: cardUsefulness(card, hand, melds),
  }));
  scored.sort((a, b) => a.score !== b.score ? a.score - b.score : b.card.value - a.card.value);
  return scored[0].card;
}

// ── DRAW DECISION ─────────────────────────────────────────────────────────────

function shouldDrawDiscard(topDiscard, hand, melds, difficulty, threat) {
  if (!topDiscard) return false;

  // Does it immediately complete a run with hand cards?
  const withCard = [...hand, topDiscard];
  const meld = findMeldWith(withCard, topDiscard);
  if (meld && isValidRun(meld)) return true;

  // Can it extend a table run?
  for (const m of melds) {
    if (isValidExtension(m.cards, [topDiscard])) return true;
    if (m.type === 'run' && canReplaceJoker(m.cards, topDiscard)) return true;
  }

  if (difficulty === 'hard') {
    // Build toward partial run: adjacent same-suit card in hand
    const sameSuit = hand.filter(c => !c.isJoker && c.suit === topDiscard.suit);
    for (const c of sameSuit) {
      if (Math.abs(c.value - topDiscard.value) === 1) return true;
    }
    // Under high/critical threat, accept any 2-gap partial run
    if (threat === 'high' || threat === 'critical') {
      for (const c of sameSuit) {
        if (Math.abs(c.value - topDiscard.value) === 2) return true;
      }
    }
  }

  return false;
}

// ── WIN EXECUTION ─────────────────────────────────────────────────────────────

async function executeWin(game, botId, winResult, broadcast) {
  const botRef = () => game.players.find(p => p.id === botId);

  for (const meld of winResult.melds) {
    if (game.status !== 'playing') return false;
    const ids = meld.map(c => botRef().hand.find(h => h.id === c.id)?.id).filter(Boolean);
    if (ids.length !== meld.length) continue;
    const result = playMeld(game, botId, ids);
    if (!result.error) {
      broadcast();
      await delay(400);
    }
  }

  // Extend remaining hand cards into any table meld
  let extended = true;
  while (extended && botRef().hand.length > 0) {
    extended = false;
    for (const meld of game.melds) {
      if (botRef().hand.length === 0) break;
      for (const card of [...botRef().hand]) {
        const r = extendMeld(game, botId, meld.id, [card.id]);
        if (!r.error) {
          broadcast();
          await delay(300);
          extended = true;
          break;
        }
      }
    }
  }

  // Discard the one remaining card (if any) — never a Joker
  if (botRef().hand.length > 0) {
    const discCard = winResult.discard
      ? botRef().hand.find(c => c.id === winResult.discard.id)
      : null;
    const toDiscard = discCard || botRef().hand.find(c => !c.isJoker);
    if (toDiscard) {
      discardCard(game, botId, toDiscard.id);
      broadcast();
    }
  }

  return true;
}

// ── MAIN BOT TURN ─────────────────────────────────────────────────────────────

export async function executeBotTurn(game, botId, difficulty, broadcast) {
  await delay(difficulty === 'hard' ? 1200 : 800);
  if (game.status !== 'playing') return;
  if (game.stopCalledBy) return;

  const bot = () => game.players.find(p => p.id === botId);
  const threat = () => getThreatLevel(game, botId);

  // ── FIRST TURN ───────────────────────────────────────────────────────────
  if (game.turnPhase === 'firstDraw') {
    const drawResult = doFirstDraw(game, botId);
    if (drawResult.error) return;
    broadcast();
    await delay(600);
    if (game.status !== 'playing' || game.stopCalledBy) return;

    const drawnCard = bot().hand.at(-1);
    let keep;
    if (difficulty === 'easy')   keep = true;
    else if (difficulty === 'medium') keep = drawnCard.value <= 7 || drawnCard.isJoker;
    else /* hard */ keep = drawnCard.value <= 5 || drawnCard.isJoker
                        || threat() === 'high' || threat() === 'critical';

    const keepResult = firstKeepOrDiscard(game, botId, keep);
    if (keepResult.error) return;
    broadcast();
    await delay(500);
    if (game.status !== 'playing' || game.stopCalledBy) return;
  }

  // ── DRAW PHASE ───────────────────────────────────────────────────────────
  if (game.turnPhase === 'draw') {
    const topDiscard = game.discardPile.at(-1);
    let drewFromDiscard = false;
    const currentThreat = threat();

    if (topDiscard && !bot().discardBanned && difficulty !== 'easy') {
      if (shouldDrawDiscard(topDiscard, bot().hand, game.melds, difficulty, currentThreat)) {
        const r = drawFromDiscard(game, botId);
        if (!r.error) {
          broadcast();
          drewFromDiscard = true;
          await delay(600);
          if (game.status !== 'playing') return;
          // Check for a full win first (discard card may complete a winning set)
          const winResultAfterDraw = findWinningMelds(bot().hand);
          if (winResultAfterDraw && (!winResultAfterDraw.discard || !winResultAfterDraw.discard.isJoker)) {
            await executeWin(game, botId, winResultAfterDraw, broadcast);
            if (game.status !== 'playing') return;
          } else {
            // Play any meld that includes the picked discard card
            const pickedCard = bot().hand.find(c => c.id === topDiscard.id) || bot().hand.at(-1);
            const meld = findMeldWith(bot().hand, pickedCard);
            if (meld) {
              const ids = meld.map(c => bot().hand.find(h => h.id === c.id)?.id).filter(Boolean);
              if (ids.length === meld.length) {
                const mr = playMeld(game, botId, ids);
                if (!mr.error) {
                  broadcast();
                  await delay(500);
                  if (game.status !== 'playing') return;
                }
              }
            }
          }
        }
      }
    }

    if (!drewFromDiscard) {
      const r = drawFromPile(game, botId);
      if (r.error) { nextTurn(game); broadcast(); return; }
      broadcast();
      await delay(600);
      if (game.status !== 'playing') return;
    }
  }

  // ── PLAY PHASE ───────────────────────────────────────────────────────────
  if (game.turnPhase === 'play') {
    const currentThreat = threat();
    const botScore = bot().totalScore || 0;
    const holding = difficulty === 'hard' && shouldHoldCards(botScore, currentThreat);
    const hand = () => bot().hand;

    // 1. CHECK FOR WIN FIRST ─────────────────────────────────────────────
    //    Hard: always. Medium: 80% chance. Easy: 20% chance (often misses wins).
    const winCheckChance = difficulty === 'hard' ? 1.0 : difficulty === 'medium' ? 0.8 : 0.2;
    if (Math.random() < winCheckChance) {
      const winResult = findWinningMelds(hand());
      if (winResult && (!winResult.discard || !winResult.discard.isJoker)) {
        await executeWin(game, botId, winResult, broadcast);
        if (game.status !== 'playing' || hand().length === 0) return;
      }
    }
    if (game.status !== 'playing') return;

    // 2. JOKER URGENCY (hard only) ────────────────────────────────────────
    //    If holding a Joker: slot it into a table run immediately if possible,
    //    or play it in a new meld. Never sit on a Joker (50 pt penalty).
    if (difficulty === 'hard' && hand().some(c => c.isJoker)) {
      const slotted = await trySlotJokerIntoRun(game, botId, broadcast);
      if (slotted) {
        await delay(300);
        if (game.status !== 'playing') return;
      }
      // Still has Joker — try to play it in a new meld
      if (hand().some(c => c.isJoker)) {
        const jokerMeld = findBestMeld(hand());
        if (jokerMeld && jokerMeld.some(c => c.isJoker)) {
          playMeld(game, botId, jokerMeld.map(c => c.id));
          broadcast();
          await delay(500);
          if (game.status !== 'playing') return;
        }
      }
    }

    // 3. PLAY NORMAL MELDS ────────────────────────────────────────────────
    //    Hard near 200 holds back (score guard) — unless under critical threat
    //    where even guarded bots play to minimise hand penalty.
    const canPlayMelds = !holding || (difficulty === 'hard' && currentThreat === 'critical');
    if (canPlayMelds) {
      const meldLimit = difficulty === 'easy' ? 1 : 10;
      let meldsPlayed = 0;
      while (meldsPlayed < meldLimit && hand().length > 1) {
        if (difficulty === 'easy' && Math.random() > 0.4) break;
        const meld = findBestMeld(hand());
        if (!meld) break;
        const result = playMeld(game, botId, meld.map(c => c.id));
        if (result.error) break;
        broadcast();
        meldsPlayed++;
        await delay(500);
        if (game.status !== 'playing') return;
      }
    } else if (holding && hand().some(c => c.isJoker)) {
      // Score-guarding but holding a Joker — still play the Joker to avoid 50pt penalty
      const jokerMeld = findBestMeld(hand());
      if (jokerMeld) {
        playMeld(game, botId, jokerMeld.map(c => c.id));
        broadcast();
        await delay(500);
        if (game.status !== 'playing') return;
      }
    }

    // 4. EXTEND TABLE MELDS (medium/hard) ────────────────────────────────
    //    Skip if score-guarding, unless critical threat forces hand reduction.
    if (difficulty !== 'easy' && (!holding || currentThreat === 'critical')) {
      for (const meld of game.melds) {
        if (hand().length <= 1) break;
        for (const card of [...hand()]) {
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

    if (game.status !== 'playing') return;

    // 5. STEAL JOKERS ─────────────────────────────────────────────────────
    //    Easy: 15% chance. Medium/Hard: always try.
    if (difficulty !== 'easy' || Math.random() < 0.15) {
      for (const meld of game.melds) {
        if (hand().length <= 1) break;
        if (meld.type !== 'run' || !meld.cards.some(c => c.isJoker)) continue;

        for (const card of [...hand()]) {
          if (card.isJoker) continue;
          if (canReplaceJoker(meld.cards, card)) {
            // Only steal if we can immediately play the Joker (new meld or win)
            const virtualJoker = { isJoker: true, id: '__vj__', rank: 'JOKER', value: 50 };
            const handAfterSteal = [...hand().filter(c => c.id !== card.id), virtualJoker];
            const hasMeldForJoker = findBestMeld(handAfterSteal)?.some(c => c.isJoker);
            const canWinWithJoker = findWinningMelds(handAfterSteal) !== null;
            if (!hasMeldForJoker && !canWinWithJoker) continue;

            const result = stealJoker(game, botId, meld.id, card.id);
            if (!result.error) {
              broadcast();
              await delay(500);
              if (game.status !== 'playing') return;
              // Immediately slot/play the stolen Joker
              if (difficulty === 'hard') {
                await trySlotJokerIntoRun(game, botId, broadcast);
                if (game.status !== 'playing') return;
              }
              const jokerMeld = findBestMeld(hand());
              if (jokerMeld) {
                playMeld(game, botId, jokerMeld.map(c => c.id));
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
  }

  // ── DISCARD ──────────────────────────────────────────────────────────────
  if (game.turnPhase === 'play' && bot().hand.length > 0) {
    const currentThreat = threat();
    let card = pickDiscardCard(bot().hand, difficulty, game.melds, currentThreat);

    // Edge case: only Jokers remain — must slot or play one before discarding
    if (!card) {
      const joker = bot().hand.find(c => c.isJoker);
      if (joker) {
        const slotted = await trySlotJokerIntoRun(game, botId, broadcast);
        if (slotted && game.status !== 'playing') return;
        if (bot().hand.some(c => c.isJoker)) {
          const meld = findBestMeld(bot().hand);
          if (meld) {
            playMeld(game, botId, meld.map(c => c.id));
            broadcast();
            await delay(400);
            if (game.status !== 'playing') return;
          }
        }
        card = pickDiscardCard(bot().hand, difficulty, game.melds, currentThreat);
      }
    }

    if (card) {
      discardCard(game, botId, card.id);
      broadcast();
    } else {
      console.log('⚠️ Bot truly stuck with only Jokers');
      nextTurn(game);
      broadcast();
    }
  }
}
