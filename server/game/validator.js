// Try a run with a specific ace value (1 or 14)
function checkRunWithValues(cards, getVal) {
  const jokers = cards.filter(c => c.isJoker);
  const nonJokers = cards.filter(c => !c.isJoker);

  if (jokers.length > 1) return false;
  if (cards.length < 3) return false;

  // All non-jokers must share the same suit
  const suits = new Set(nonJokers.map(c => c.suit));
  if (suits.size !== 1) return false;

  const sorted = [...nonJokers].sort((a, b) => getVal(a) - getVal(b));

  if (jokers.length === 0) {
    // Simple case: all cards must be consecutive
    for (let i = 1; i < sorted.length; i++) {
      if (getVal(sorted[i]) !== getVal(sorted[i - 1]) + 1) return false;
    }
    return true;
  }

  // With 1 joker: find exactly one gap of 2 between non-jokers
  let gapCount = 0;
  let gapPosition = -1;

  for (let i = 1; i < sorted.length; i++) {
    const diff = getVal(sorted[i]) - getVal(sorted[i - 1]);
    if (diff === 1) continue;       // consecutive, fine
    if (diff === 2) { gapCount++; gapPosition = i; } // joker fills this gap
    else return false;              // gap too large, invalid
  }

  // Joker must fill exactly one gap (not extend the ends)
  if (gapCount !== 1) return false;

  // Joker cannot be at the very start or very end of the run
  const jokerIndex = gapPosition;
  if (jokerIndex === 0 || jokerIndex === cards.length - 1) return false;

  return true;
}

function isValidRun(cards) {
  // Try Ace as low (1) and Ace as high (14) — accept either
  const asLow  = (c) => c.rank === 'A' ? 1  : c.value;
  const asHigh = (c) => c.rank === 'A' ? 14 : c.value;
  return checkRunWithValues(cards, asLow) || checkRunWithValues(cards, asHigh);
}

function isValidSet(cards) {
  if (cards.length !== 3) return false;
  if (cards.some(c => c.isJoker)) return false;
  const ranks = new Set(cards.map(c => c.rank));
  if (ranks.size !== 1) return false;
  // No duplicate suits allowed in a set
  const suits = cards.map(c => c.suit);
  return new Set(suits).size === suits.length;
}

function isValidMeld(cards) {
  if (cards.length < 3) return false;
  return isValidSet(cards) || isValidRun(cards);
}

// Check if newCards can be added to an existing meld on the table
function isValidExtension(existingMeld, newCards) {
  const isSet = existingMeld.length >= 3 &&
                !existingMeld.some(c => c.isJoker) &&
                existingMeld.every(c => c.rank === existingMeld[0].rank);

  if (isSet) {
    if (newCards.some(c => c.isJoker)) return false;
    const setRank = existingMeld[0].rank;
    if (!newCards.every(c => c.rank === setRank)) return false;

    // Only the 3 suits already in the set are allowed
    const allowedSuits = new Set(existingMeld.map(c => c.suit));
    if (!newCards.every(c => allowedSuits.has(c.suit))) return false;

    // Max 6 cards total
    if (existingMeld.length + newCards.length > 6) return false;

    // Max 2 of any one suit
    const suitCounts = {};
    [...existingMeld, ...newCards].forEach(c => {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    });
    return Object.values(suitCounts).every(count => count <= 2);
  }

  return isValidRun([...existingMeld, ...newCards]);
}

function calculateHandScore(hand) {
  const aces   = hand.filter(c => c.rank === 'A');
  const jokers = hand.filter(c => c.isJoker);
  const others = hand.filter(c => c.rank !== 'A' && !c.isJoker);

  let score = 0;
  score += jokers.length * 50;
  score += others.reduce((sum, c) => sum + c.value, 0);
  // Multiple aces = 14 each, single ace = 1
  score += aces.length > 1 ? aces.length * 14 : aces.length;

  return score;
}

function getCombinations(arr, size) {
  if (size === 0) return [[]];
  if (arr.length < size) return [];
  const [head, ...tail] = arr;
  return [
    ...getCombinations(tail, size - 1).map(c => [head, ...c]),
    ...getCombinations(tail, size),
  ];
}

// Check if a specific card can form a valid run with cards already in hand
function canFormRunWith(card, hand) {
  const others = hand.filter(c => c.id !== card.id);
  for (let size = 2; size <= Math.min(others.length, 6); size++) {
    for (const combo of getCombinations(others, size)) {
      if (isValidRun([card, ...combo])) return true;
    }
  }
  return false;
}

// Check if discard card can be used — either in a hand run OR to extend a table run
function canUseDiscardCard(card, hand, melds) {
  if (canFormRunWith(card, hand)) return true;

  for (const meld of (melds || [])) {
    if (isValidExtension(meld.cards, [card])) return true;
    if (meld.type === 'run' && canReplaceJoker(meld.cards, card)) return true;

    // NEW: discard + some hand cards can together extend a table run
    if (meld.type === 'run') {
      const candidates = hand.filter(c => c.isJoker || c.suit === card.suit);
      for (let size = 1; size <= Math.min(candidates.length, 3); size++) {
        for (const combo of getCombinations(candidates, size)) {
          if (isValidExtension(meld.cards, [card, ...combo])) return true;
        }
      }
    }
  }

  // Steal a Joker first, then use discard card
  const virtualJoker = { isJoker: true, rank: 'JOKER', value: 50, id: 'virtual' };
  for (const meld of (melds || [])) {
    if (meld.type !== 'run' || !meld.cards.some(c => c.isJoker)) continue;
    for (const handCard of hand) {
      if (handCard.isJoker) continue;
      if (canReplaceJoker(meld.cards, handCard)) {
        const handWithJoker = [...hand.filter(c => c.id !== handCard.id), virtualJoker];
        if (canFormRunWith(card, handWithJoker)) return true;
      }
    }
  }

  return false;
}

// Check if a card can replace the Joker in a run meld
function canReplaceJoker(meldCards, replacementCard) {
  if (!meldCards.some(c => c.isJoker)) return false;
  const withoutJoker = meldCards.filter(c => !c.isJoker);
  return isValidRun([...withoutJoker, replacementCard]);
}

// Special rule: when going out, Joker can be at start or end of a run
// but the run cannot also contain a Jack
export function isValidWinningRun(cards) {
  if (cards.length < 3) return false;

  const jokers = cards.filter(c => c.isJoker);
  const nonJokers = cards.filter(c => !c.isJoker);

  // Still max 1 joker per run
  if (jokers.length > 1) return false;

  // No joker — same as regular run
  if (jokers.length === 0) return isValidRun(cards);

  // All non-jokers must be same suit
  const suit = nonJokers[0].suit;
  if (!nonJokers.every(c => c.suit === suit)) return false;

  // No duplicate values
  const values = nonJokers.map(c => c.value);
  if (new Set(values).size !== values.length) return false;

  // Sort non-jokers by value
  const sorted = [...nonJokers].sort((a, b) => a.value - b.value);

  // Check gaps — joker fills 1 gap OR sits at start/end
  let gaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i].value - sorted[i - 1].value;
    if (diff === 1) continue;       // consecutive, no gap
    if (diff === 2) { gaps++; continue; } // joker fills this gap
    return false;                   // gap too large for 1 joker
  }

  // gaps=0 means joker at start or end (both valid when winning)
  // gaps=1 means joker in middle (always valid)
  return gaps <= 1;
}

export { isValidRun, isValidSet, isValidMeld, isValidExtension,
         calculateHandScore, canFormRunWith, canUseDiscardCard,
         canReplaceJoker };