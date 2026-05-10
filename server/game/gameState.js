import { createDeck, deal } from './deck.js';
import { isValidMeld, isValidSet, isValidRun, isValidExtension,
         calculateHandScore, canUseDiscardCard, canReplaceJoker,
         isValidWinningRun } from './validator.js';
let meldCounter = 0;
const newMeldId = () => `meld-${++meldCounter}`;
const getCurrentPlayer = (game) => game.players[game.currentPlayerIndex];


function shufflePile(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}


// ─── CREATE & START ───────────────────────────────────────────────────────────

export function createGame(playerInfos) {
  // playerInfos: [{ id, name, isBot }]
  return {
    status: 'waiting',
    round: 0,
    players: playerInfos.map(p => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot || false,
      difficulty: p.difficulty || null,
      avatarId: p.avatarId || 'sporty',
      hand: [],
      totalScore: 0,
      hasExploded: false,
      eliminated: false,
      stopBanned: false,    // penalty: false STOP press
      discardBanned: false, // penalty: false STOP press
    })),
    currentPlayerIndex: 0,
    startingPlayerIndex: 0,
    turnPhase: 'draw',
    drawPile: [],
    discardPile: [],
    melds: [],
    pickedFromDiscard: false,
    pickedDiscardCard: null,
    stopCalledBy: null,
    lastDiscardedBy: null,
  };
}

export function initiateStop(game, playerId, claimedCardId) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) return { error: 'Player not found' };
  if (player.stopBanned) return { error: 'You cannot use STOP this round' };
  if (game.discardPile.length === 0) return { error: 'No discard card' };
  if (game.stopCalledBy) return { error: 'STOP already called' };

  const topDiscard = game.discardPile.at(-1);
  // Validate the card hasn't changed since player pressed STOP
  if (claimedCardId && topDiscard.id !== claimedCardId) {
    return { error: 'Too slow — the discard card changed! Try again' };
  }

  game.stopCalledBy = playerId;
  return { success: true };
}

export function resumeAfterStop(game) {
  game.stopCalledBy = null;
}

export function startRound(game) {
  const active = game.players.filter(p => !p.eliminated);
  const deck = createDeck();
  const { hands, drawPile, discardPile } = deal(deck, active.length);

   active.forEach((p, i) => {
    p.hand = hands[i];
    p.stopBanned = false;
    p.discardBanned = false;
    p.explodedThisRound = false;
  });

  // Clear leftover cards from eliminated players
  game.players.filter(p => p.eliminated).forEach(p => { p.hand = []; });

  game.round += 1;

  if (game.round > 1) {
    // Advance clockwise from whoever STARTED the previous round
    const prevStartId = game.players[game.startingPlayerIndex]?.id;
    const prevActiveIdx = active.findIndex(p => p.id === prevStartId);
    const nextActiveIdx = (prevActiveIdx + 1) % active.length;
    game.startingPlayerIndex = game.players.findIndex(
      p => p.id === active[nextActiveIdx].id
    );
  }

  game.currentPlayerIndex = game.startingPlayerIndex;
  game.drawPile = drawPile;
  game.discardPile = discardPile;
  game.melds = [];
  game.status = 'playing';
  game.pickedFromDiscard = false;
  game.pickedDiscardCard = null;
  game.stopCalledBy = null;
  game.turnPhase = 'firstDraw';
  return game;
}

// ─── FIRST PLAYER SPECIAL TURN ────────────────────────────────────────────────

// Step 1: first player draws a card
export function firstDraw(game, playerId) {
  if (game.turnPhase !== 'firstDraw') return { error: 'Not in first draw phase' };
  if (getCurrentPlayer(game).id !== playerId) return { error: 'Not your turn' };
  if (game.drawPile.length === 0) return { error: 'Draw pile is empty' };

  const card = game.drawPile.pop();
  getCurrentPlayer(game).hand.push(card);
  game.lastDrawnCard = card;
  game.turnPhase = 'firstKeepOrDiscard';
  return { success: true, card };
}

// Step 2: first player decides to keep or discard the drawn card
export function firstKeepOrDiscard(game, playerId, keep) {
  if (game.turnPhase !== 'firstKeepOrDiscard') return { error: 'Wrong phase' };
  if (getCurrentPlayer(game).id !== playerId) return { error: 'Not your turn' };

  const player = getCurrentPlayer(game);

  if (keep) {
    game.turnPhase = 'play';
  } else {
    // Discard the drawn card, draw a fresh one
    const card = player.hand.pop();
    game.discardPile.push(card);
    if (game.drawPile.length === 0) return { error: 'Draw pile is empty' };
    const newCard = game.drawPile.pop();
    player.hand.push(newCard);
    game.turnPhase = 'play';
  }

  game.lastDrawnCard = null;
  return { success: true };
}

// ─── NORMAL TURN ACTIONS ──────────────────────────────────────────────────────

export function drawFromPile(game, playerId) {
  if (game.turnPhase !== 'draw') return { error: 'Not your draw phase' };
  if (getCurrentPlayer(game).id !== playerId) return { error: 'Not your turn' };

  // If draw pile is empty, reshuffle discard pile into it
  if (game.drawPile.length === 0) {
    if (game.discardPile.length <= 1) return { error: 'No cards left in the game' };
    const topCard = game.discardPile.pop();
    game.drawPile = shufflePile([...game.discardPile]);
    game.discardPile = topCard ? [topCard] : [];
  }

  const card = game.drawPile.pop();
  getCurrentPlayer(game).hand.push(card);
  game.turnPhase = 'play';
  game.pickedFromDiscard = false;
  game.pickedDiscardCard = null;
  return { success: true, card };
}

export function drawFromDiscard(game, playerId) {
  if (game.turnPhase !== 'draw') return { error: 'Not your draw phase' };
  if (getCurrentPlayer(game).id !== playerId) return { error: 'Not your turn' };
  if (getCurrentPlayer(game).discardBanned) return { error: 'You cannot pick from the discard pile this round' };
  if (game.discardPile.length === 0) return { error: 'Discard pile is empty' };

  const card = game.discardPile.at(-1);
  const player = getCurrentPlayer(game);

  const wouldWinWithSet = !card.isJoker &&
    player.hand.filter(c => !c.isJoker && c.rank === card.rank && c.suit !== card.suit).length >= 2 &&
    new Set(player.hand.filter(c => !c.isJoker && c.rank === card.rank && c.suit !== card.suit).map(c => c.suit)).size >= 2;

  if (!canUseDiscardCard(card, player.hand, game.melds) && !wouldWinWithSet) {
    return { error: `You can only pick from discard if you can use ${card.rank} in a run` };
  }

  game.discardPile.pop();
  player.hand.push(card);
  game.pickedFromDiscard = true;
  game.pickedDiscardCard = card;
  game.turnPhase = 'play';
  return { success: true, card };
}

export function playMeld(game, playerId, cardIds) {
  if (game.turnPhase !== 'play') return { error: 'Not in play phase' };
  if (getCurrentPlayer(game).id !== playerId) return { error: 'Not your turn' };

  const player = getCurrentPlayer(game);
  const cards = cardIds.map(id => player.hand.find(c => c.id === id)).filter(Boolean);
  if (cards.length !== cardIds.length) return { error: 'Some cards not found in your hand' };

  // If player picked from discard, that card must be used and only in a run
  if (game.pickedFromDiscard && !game.stopCalledBy) {
    const usesDiscardCard = cards.find(c => c.id === game.pickedDiscardCard.id);
    if (usesDiscardCard && !isValidRun(cards)) {
      return { error: 'Card picked from discard pile can only be used in a run' };
    }
  }

  const remainingAfter = player.hand.filter(c => !cardIds.includes(c.id));
  const isWinningMove = remainingAfter.length === 1;
  const isStopPhase = !!game.stopCalledBy;
  const valid = (isWinningMove || isStopPhase)
    ? (isValidSet(cards) || isValidWinningRun(cards))
    : isValidMeld(cards);
  if (!valid) return { error: 'Invalid meld' };

  const type = isValidSet(cards) ? 'set' : 'run';
  player.hand = player.hand.filter(c => !cardIds.includes(c.id));

  // Mark discard card as used if it was part of this meld
  if (game.pickedFromDiscard && cards.find(c => c.id === game.pickedDiscardCard?.id)) {
    game.pickedFromDiscard = false;
  }

  const meld = { id: newMeldId(), ownerId: playerId, cards, type };
  game.melds.push(meld);

  if (player.hand.length === 0) return endRound(game, playerId);
  return { success: true, meld };
}

export function extendMeld(game, playerId, meldId, cardIds) {
  if (game.turnPhase !== 'play') return { error: 'Not in play phase' };
  if (getCurrentPlayer(game).id !== playerId) return { error: 'Not your turn' };

  const player = getCurrentPlayer(game);
  const meld = game.melds.find(m => m.id === meldId);
  if (!meld) return { error: 'Meld not found' };

  const cards = cardIds.map(id => player.hand.find(c => c.id === id)).filter(Boolean);
  if (cards.length !== cardIds.length) return { error: 'Some cards not found in your hand' };

  if (game.pickedFromDiscard) {
    const usesDiscardCard = cards.find(c => c.id === game.pickedDiscardCard.id);
    if (usesDiscardCard && meld.type === 'set') {
      return { error: 'Card picked from discard pile can only be used in a run' };
    }
  }

  // Check if this would empty the hand (winning move) — allow joker at end
  const remainingAfter = player.hand.filter(c => !cardIds.includes(c.id));
  const isWinningMove = remainingAfter.length <= 1;
  const combined = [...meld.cards, ...cards];
  const valid = (isWinningMove || game.stopCalledBy)
    ? (isValidExtension(meld.cards, cards) || isValidWinningRun(combined))
    : isValidExtension(meld.cards, cards);

  if (!valid) return { error: 'Invalid extension' };

  player.hand = player.hand.filter(c => !cardIds.includes(c.id));
  meld.cards = [...meld.cards, ...cards];

  if (game.pickedFromDiscard && cards.find(c => c.id === game.pickedDiscardCard?.id)) {
    game.pickedFromDiscard = false;
  }

  if (player.hand.length === 0) return endRound(game, playerId);
  return { success: true, meld };
}

export function stealJoker(game, playerId, meldId, replacementCardId) {
  if (game.turnPhase !== 'play') return { error: 'Not in play phase' };
  if (getCurrentPlayer(game).id !== playerId) return { error: 'Not your turn' };

  const player = getCurrentPlayer(game);
  const meld = game.melds.find(m => m.id === meldId);
  if (!meld) return { error: 'Meld not found' };
  if (meld.type !== 'run') return { error: 'Can only steal jokers from runs' };

  const joker = meld.cards.find(c => c.isJoker);
  if (!joker) return { error: 'No joker in this meld' };

  const replacement = player.hand.find(c => c.id === replacementCardId);
  if (!replacement) return { error: 'Card not found in your hand' };

  if (!canReplaceJoker(meld.cards, replacement)) {
    return { error: 'Your card cannot replace the joker in this meld' };
  }

// Swap: real card goes into meld, joker comes to hand
  meld.cards = [...meld.cards.filter(c => !c.isJoker), replacement];
  player.hand = player.hand.filter(c => c.id !== replacementCardId);
  player.hand.push(joker);

  // If player picked this card from the discard pile, mark it as used
  if (game.pickedFromDiscard && game.pickedDiscardCard?.id === replacementCardId) {
    game.pickedFromDiscard = false;
    game.pickedDiscardCard = null;
  }

  if (player.hand.length === 0) return endRound(game, playerId);
  return { success: true };
}

export function startPicking(game) {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const vals  = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};

  let id = 5000;
  const deck = suits.flatMap(suit =>
    ranks.map(rank => ({ id: id++, suit, rank, value: vals[rank], isJoker: false }))
  );

  const shuffled = shufflePile(deck);
  const count = Math.max(game.players.length * 4, 16);

  game.status       = 'picking';
  game.pickingCards = shuffled.slice(0, count);
  game.playerPicks  = {};
  game.pickingRevealed  = false;
  game.pickingWinnerId  = null;
  return game;
}

export function pickCard(game, playerId, cardId) {
  if (game.status !== 'picking') return { error: 'Not in picking phase' };
  if (game.playerPicks[playerId])  return { error: 'You already picked a card' };

  const alreadyTaken = Object.values(game.playerPicks).some(c => c?.id === cardId);
  if (alreadyTaken) return { error: 'Card already taken by another player' };

  const card = game.pickingCards.find(c => c.id === cardId);
  if (!card) return { error: 'Card not found' };

  game.playerPicks[playerId] = card;

  const active    = game.players.filter(p => !p.eliminated);
  const allPicked = active.every(p => game.playerPicks[p.id]);

  if (allPicked) {
    game.pickingRevealed = true;
    const suitOrder = { spades: 4, hearts: 3, diamonds: 2, clubs: 1 };
    const score     = c => c.value * 10 + (suitOrder[c.suit] || 0);

    const winner = active.reduce((best, p) =>
      score(game.playerPicks[p.id]) > score(game.playerPicks[best.id]) ? p : best
    );

    game.pickingWinnerId = winner.id;

    // Winner is DEALER — player to their LEFT goes first
    const winnerActiveIdx = active.findIndex(p => p.id === winner.id);
    const firstActiveIdx  = (winnerActiveIdx + 1) % active.length;
    game.startingPlayerIndex = game.players.findIndex(
      p => p.id === active[firstActiveIdx].id
    );
  }

  return { success: true, allPicked };
}

export function discardCard(game, playerId, cardId) {
  if (game.turnPhase !== 'play') return { error: 'Not in play phase' };
  if (getCurrentPlayer(game).id !== playerId) return { error: 'Not your turn' };

  // Must use the discard card before ending turn
  if (game.pickedFromDiscard) {
    return { error: 'You must use the card you picked from the discard pile in a run first' };
  }

  const player = getCurrentPlayer(game);
  const cardIndex = player.hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return { error: 'Card not found in your hand' };

  // Jokers cannot be discarded
  if (player.hand[cardIndex].isJoker) return { error: 'You cannot discard a Joker' };

  const [card] = player.hand.splice(cardIndex, 1);
  game.discardPile.push(card);

  if (player.hand.length === 0) return endRound(game, playerId);

  nextTurn(game);
  game.lastDiscardedBy = playerId;
  return { success: true, card };
}

// ─── STOP ────────────────────────────────────────────────────────────────────

// proposedMelds: array of arrays of card IDs (the player's full hand split into melds)
// finalDiscardId: optional — one card ID the player wants to discard to go out
export function callStop(game, playerId, proposedMelds, finalDiscardId) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) return { error: 'Player not found' };
  if (player.stopBanned) return { error: 'You cannot use STOP this round' };
  if (game.discardPile.length === 0) return { error: 'No discard card available' };

  const topDiscard = game.discardPile[game.discardPile.length - 1];
  const fullHand = [...player.hand, topDiscard]; // hand + stolen discard card

  // All cards in hand + discard must appear in proposedMelds + optional finalDiscard
  const meldCardIds = proposedMelds.flat();
  const allUsedIds = finalDiscardId ? [...meldCardIds, finalDiscardId] : meldCardIds;
  const allHandIds = fullHand.map(c => c.id);

  const allAccountedFor = allHandIds.every(id => allUsedIds.includes(id));
  const noExtraCards = allUsedIds.every(id => allHandIds.includes(id));

  if (!allAccountedFor || !noExtraCards) {
    return penalizeStop(game, player, 'Your proposed melds do not account for all your cards');
  }

  // Validate each proposed meld
  for (const meldIds of proposedMelds) {
    const cards = meldIds.map(id => fullHand.find(c => c.id === id)).filter(Boolean);
    if (!isValidMeld(cards)) {
      return penalizeStop(game, player, 'One of your proposed melds is invalid');
    }
    // Discard card must go into a run, not a set
    if (cards.find(c => c.id === topDiscard.id) && isValidSet(cards)) {
      return penalizeStop(game, player, 'The discard card can only be used in a run');
    }
  }

  // Valid STOP — player wins the round
  game.discardPile.pop();
  player.hand = [];
  return endRound(game, playerId);
}

function penalizeStop(game, player, reason) {
  player.stopBanned = true;
  player.discardBanned = true;
  return { error: reason, penalized: true };
}

// ─── END OF ROUND & SCORING ───────────────────────────────────────────────────

function endRound(game, winnerId) {
  // Clear stop state when round ends
  game.stopCalledBy = null;
  game.stopDeadline = null;
  game.stopOriginalPlayerIndex = null;
  game.stopOriginalPhase = null;
  game.status = 'roundEnd';
  game.players.forEach(p => {
    if (p.id === winnerId || p.eliminated) return;

    const roundScore = calculateHandScore(p.hand);
    p.totalScore += roundScore;

    if (p.totalScore >= 200) {
      if (!p.hasExploded) {
        // First explosion: reset score to highest score among other active players
        const otherScores = game.players
          .filter(o => o.id !== p.id && !o.eliminated)
          .map(o => o.totalScore);
        p.totalScore = Math.max(...otherScores);
        p.hasExploded = true;
        p.explodedThisRound = true;
      } else {
        // Second time reaching 200: eliminated
        p.eliminated = true;
      }
    }
  });

  // Check if game is over (only 1 active player left)
  const active = game.players.filter(p => !p.eliminated);
  if (active.length === 1) {
    game.status = 'gameOver';
    game.winner = active[0].id;
  }

  return { success: true, roundEnd: true, winnerId, players: game.players };
}

export function nextTurn(game) {
  const active = game.players.filter(p => !p.eliminated);
  const currentId = game.players[game.currentPlayerIndex].id;
  const currentActiveIndex = active.findIndex(p => p.id === currentId);
  const nextActive = active[(currentActiveIndex + 1) % active.length];
  game.currentPlayerIndex = game.players.findIndex(p => p.id === nextActive.id);
  game.turnPhase = 'draw';
  game.pickedFromDiscard = false;
  game.pickedDiscardCard = null;
}

// ─── PLAYER VIEW (hides other hands, always hides draw pile) ─────────────────

export function getPlayerView(game, playerId, debugMode = false) {
  return {
    ...game,
    drawPile: game.drawPile.map(() => ({ hidden: true })),
    pickingCards: (game.pickingCards || []).map(c =>
      game.pickingRevealed ? c : { id: c.id, hidden: true }
    ),
    players: game.players.map(p => ({
      ...p,
      hand: (p.id === playerId || debugMode)
        ? p.hand
        : p.hand.map(() => ({ hidden: true })),
    })),
  };
}