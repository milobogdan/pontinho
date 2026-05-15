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
  let bestMeld = null;
  let bestValue = -1;
  // Iterate largest to smallest so equal-value ties keep the bigger meld
  for (let size = max; size >= 3; size--) {
    for (const combo of getCombinations(hand, size)) {
      if (isValidMeld(combo)) {
        const val = combo.reduce((s, c) => s + c.value, 0);
        if (val > bestValue) { bestValue = val; bestMeld = combo; }
      }
    }
  }
  return bestMeld;
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
  // 1 non-Joker card left = can always be discarded to win; 1 Joker = stuck (can't discard)
  if (cards.length === 1) return cards[0].isJoker ? null : [];
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

// Returns true if this meld is a run whose value range is directly contiguous with
// an existing table run of the same suit (prefer extending over creating a new isolated run)
function isRunContiguousWithTable(meld, tableMelds) {
  if (!isValidRun(meld)) return false;
  const nonJokers = meld.filter(c => !c.isJoker);
  if (!nonJokers.length) return false;
  const suit = nonJokers[0].suit;
  const vals = nonJokers.map(c => c.value).sort((a, b) => a - b);
  return tableMelds.some(m => {
    if (m.type !== 'run') return false;
    const mNJ = m.cards.filter(c => !c.isJoker);
    if (!mNJ.length || mNJ[0].suit !== suit) return false;
    const mVals = mNJ.map(c => c.value).sort((a, b) => a - b);
    return vals[0] === mVals[mVals.length - 1] + 1  // new run appends to table run's end
        || mVals[0] === vals[vals.length - 1] + 1;  // new run prepends to table run's start
  });
}

// Check if all hand cards can be placed into existing table melds (or win with remainder)
// Used to detect wins where the bot only needs to extend table runs (e.g. slot Jokers)
function canWinByExtending(hand, tableMemds) {
  if (!tableMemds || !tableMemds.length) return false;
  const simMemds = tableMemds.map(m => ({ ...m, cards: [...m.cards] }));
  const simHand = [...hand];

  let changed = true;
  while (changed && simHand.length > 0) {
    changed = false;
    for (const meld of simMemds) {
      for (let i = simHand.length - 1; i >= 0; i--) {
        const card = simHand[i];
        const combined = [...meld.cards, card];
        // Also allow winning-run extensions (Joker at start/end) — mirrors extendMeld server logic
        if (isValidExtension(meld.cards, [card]) || isValidWinningRun(combined)) {
          meld.cards.push(card);
          simHand.splice(i, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  if (simHand.length === 0) return true;
  if (simHand.length === 1 && !simHand[0].isJoker) return true;
  return findAllMelds(simHand, true) !== null;
}

// Exported — used by checkBotStop in index.js (winning rules: Joker at start/end allowed)
export function findWinningMelds(hand) {
  const all = findAllMelds(hand, true);
  if (all !== null) return { melds: all, discard: null };

  for (let i = 0; i < hand.length; i++) {
    if (hand[i].isJoker) continue; // Jokers can never be discarded
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

  // Scoring penalty: actual points cost if this card is caught in hand at round end
  // Multiple Aces cost 14pts each (not 1pt); single Ace costs 1pt
  const aceCount = hand.filter(c => c.rank === 'A').length;
  const penalty = (card.rank === 'A' && aceCount > 1) ? 14 : card.value;

  // Can replace a Joker on the table? Very valuable.
  if (melds.some(m => m.type === 'run' && canReplaceJoker(m.cards, card))) return Infinity;

  const others = hand.filter(c => c.id !== card.id && !c.isJoker);

  // Part of a potential run in hand (adjacent same-suit cards within 2)
  const sameSuit = others.filter(c => c.suit === card.suit);
  for (const other of sameSuit) {
    const diff = Math.abs(card.value - other.value);
    if (diff === 1) return penalty + 60; // adjacent — strong run potential
    if (diff === 2) return penalty + 40; // one gap — Joker could fill it
  }

  // Same rank as another hand card (potential set)
  // Pair bonus scales inversely with scoring penalty:
  // low-value pairs (2s, 3s) are worth keeping; high-value pairs (Ks, Aces) are risky
  const sameRank = others.filter(c => c.rank === card.rank && c.suit !== card.suit);
  if (sameRank.length >= 2) return penalty + 50; // three-of-a-kind: definitely keep
  if (sameRank.length === 1) return 20 - penalty * 2; // pair: positive for cheap cards, negative for expensive ones

  // Isolated card — penalise by actual scoring value
  return -penalty;
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

  // Does it complete a winning hand (including via table meld extensions)?
  if (difficulty !== 'easy') {
    const handWithDiscard = [...hand, topDiscard];
    const winResult = findWinningMelds(handWithDiscard);
    // Only draw if the winning path actually USES the picked card in a meld
    // (not discards it — can't pick a card then immediately discard it)
    if (winResult && winResult.discard?.id !== topDiscard.id) return true;
    if (canWinByExtending(handWithDiscard, melds)) return true;
  }

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

  // Sort melds so the one containing the picked discard card is played first
  // (clears pickedFromDiscard early, preventing discardCard from being blocked)
  let orderedMelds = [...winResult.melds];
  if (game.pickedFromDiscard && game.pickedDiscardCard) {
    const pickedId = game.pickedDiscardCard.id;
    const pickedMeldIdx = orderedMelds.findIndex(m => m.some(c => c.id === pickedId));
    if (pickedMeldIdx > 0) {
      const [pickedMeld] = orderedMelds.splice(pickedMeldIdx, 1);
      orderedMelds.unshift(pickedMeld);
    }
  }

  for (const meld of orderedMelds) {
    if (game.status !== 'playing') return false;
    // Use id != null (not filter(Boolean)) so card id=0 (A♥ deck 1) is not dropped
    const ids = meld.map(c => botRef().hand.find(h => h.id === c.id)?.id).filter(id => id != null);
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

  // If pickedFromDiscard still true (meld containing picked card failed), force it into a table meld
  if (game.pickedFromDiscard && game.pickedDiscardCard) {
    const pickedId = game.pickedDiscardCard.id;
    const stillInHand = botRef().hand.find(c => c.id === pickedId);
    if (stillInHand) {
      for (const m of game.melds) {
        const r = extendMeld(game, botId, m.id, [pickedId]);
        if (!r.error) { broadcast(); await delay(300); break; }
      }
    }
  }

  // Discard the one remaining card (if any) — never a Joker
  if (botRef().hand.length > 0) {
    const discCard = winResult.discard
      ? botRef().hand.find(c => c.id === winResult.discard.id)
      : null;
    const toDiscard = discCard || botRef().hand.find(c => !c.isJoker) || botRef().hand[0];
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
          if (winResultAfterDraw) {
            await executeWin(game, botId, winResultAfterDraw, broadcast);
            if (game.status !== 'playing') return;
          } else {
            // Play any meld that includes the picked discard card
            const pickedCard = bot().hand.find(c => c.id === topDiscard.id) || bot().hand.at(-1);
            let playedPicked = false;
            const meld = findMeldWith(bot().hand, pickedCard);
            if (meld) {
              // Use id != null so card id=0 (A♥ deck 1) is not dropped
              const ids = meld.map(c => bot().hand.find(h => h.id === c.id)?.id).filter(id => id != null);
              if (ids.length === meld.length) {
                const mr = playMeld(game, botId, ids);
                if (!mr.error) {
                  broadcast();
                  await delay(500);
                  if (game.status !== 'playing') return;
                  playedPicked = true;
                }
              }
            }
            // findMeldWith only checks normal run rules — try extending or stealing Joker
            // with the picked card to clear pickedFromDiscard
            if (!playedPicked && pickedCard) {
              for (const m of game.melds) {
                const r = extendMeld(game, botId, m.id, [pickedCard.id]);
                if (!r.error) {
                  broadcast();
                  await delay(500);
                  if (game.status !== 'playing') return;
                  playedPicked = true;
                  break;
                }
              }
            }
            if (!playedPicked && pickedCard) {
              for (const m of game.melds) {
                if (m.type !== 'run' || !canReplaceJoker(m.cards, pickedCard)) continue;
                const r = stealJoker(game, botId, m.id, pickedCard.id);
                if (!r.error) {
                  broadcast();
                  await delay(500);
                  if (game.status !== 'playing') return;
                  break;
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
    //    Hard/Medium: always. Easy: 20% chance (often misses wins).
    const winCheckChance = difficulty === 'easy' ? 0.2 : 1.0;
    if (Math.random() < winCheckChance) {
      const winResult = findWinningMelds(hand());
      if (winResult) {
        await executeWin(game, botId, winResult, broadcast);
        if (game.status !== 'playing' || hand().length === 0) return;
      } else if (difficulty !== 'easy' && canWinByExtending(hand(), game.melds)) {
        // Win by extending existing table melds (e.g. slotting Jokers into runs)
        await executeWin(game, botId, { melds: [], discard: null }, broadcast);
        if (game.status !== 'playing' || hand().length === 0) return;
      }
    }
    if (game.status !== 'playing') return;

    // 2. JOKER URGENCY (medium/hard) ──────────────────────────────────────
    //    If holding a Joker: slot it into a table run immediately if possible,
    //    or play it in a new meld. Never sit on a Joker (50 pt penalty).
    if ((difficulty === 'hard' || difficulty === 'medium') && hand().some(c => c.isJoker)) {
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
    //    Skip new run if those cards are contiguous with an existing table run —
    //    step 4 will extend instead (safer: avoids creating connectable gaps).
    const canPlayMelds = !holding || (difficulty === 'hard' && currentThreat === 'critical');
    if (canPlayMelds) {
      const meldLimit = difficulty === 'easy' ? 1 : 10;
      let meldsPlayed = 0;
      while (meldsPlayed < meldLimit && hand().length > 1) {
        if (difficulty === 'easy' && Math.random() > 0.4) break;
        const meld = findBestMeld(hand());
        if (!meld) break;
        // Prefer extending an existing table run over creating a new isolated one
        if (difficulty !== 'easy' && isRunContiguousWithTable(meld, game.melds)) break;
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
    //    Retry loop: keep extending the same meld until no more cards fit,
    //    so all contiguous hand cards are played in one turn (not spread across turns).
    if (difficulty !== 'easy' && (!holding || currentThreat === 'critical')) {
      let anyExtended = true;
      while (anyExtended) {
        anyExtended = false;
        for (const meld of game.melds) {
          if (hand().length <= 1) break;
          for (const card of [...hand()]) {
            if (card.isJoker) continue;
            const result = extendMeld(game, botId, meld.id, [card.id]);
            if (!result.error) {
              broadcast();
              await delay(400);
              if (game.status !== 'playing') return;
              anyExtended = true;
              break;
            }
          }
        }
      }
      // Re-check for win after extending table melds
      if (game.status === 'playing' && hand().length > 0) {
        const winAfterExtend = findWinningMelds(hand());
        if (winAfterExtend) {
          await executeWin(game, botId, winAfterExtend, broadcast);
          if (game.status !== 'playing' || hand().length === 0) return;
        } else if (canWinByExtending(hand(), game.melds)) {
          await executeWin(game, botId, { melds: [], discard: null }, broadcast);
          if (game.status !== 'playing' || hand().length === 0) return;
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
              // Check for immediate win first
              const winAfterSteal = findWinningMelds(hand());
              if (winAfterSteal) {
                await executeWin(game, botId, winAfterSteal, broadcast);
                if (game.status !== 'playing' || hand().length === 0) return;
                break;
              }
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
      const discResult = discardCard(game, botId, card.id);
      if (discResult?.error) {
        // discardCard blocked (e.g. pickedFromDiscard still true) — force nextTurn to unstick
        console.warn('⚠️ Bot discard blocked, forcing nextTurn:', discResult.error);
        nextTurn(game);
      }
      broadcast();
    } else {
      console.log('⚠️ Bot truly stuck with only Jokers');
      nextTurn(game);
      broadcast();
    }
  }
}
