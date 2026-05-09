const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const VALUES = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13
};

function createDeck() {
  const deck = [];
  let id = 0;

  // 2 standard decks
  for (let d = 0; d < 2; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          id: id++,
          suit,
          rank,
          value: VALUES[rank],
          isJoker: false
        });
      }
    }
  }

  // 4 jokers
  for (let j = 0; j < 4; j++) {
    deck.push({
      id: id++,
      suit: null,
      rank: 'JOKER',
      value: 50,
      isJoker: true
    });
  }

  return deck; // 108 cards total
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function deal(deck, playerCount) {
  const shuffled = shuffle(deck);
  const hands = Array.from({ length: playerCount }, () => []);
  const CARDS_PER_PLAYER = 9;

  // Deal 9 cards to each player
  for (let i = 0; i < CARDS_PER_PLAYER * playerCount; i++) {
    hands[i % playerCount].push(shuffled[i]);
  }

  const dealtCards = CARDS_PER_PLAYER * playerCount;
  const drawPile = shuffled.slice(dealtCards);
  const discardPile = []; // starts empty — first discard comes from play
  return { hands, drawPile, discardPile };
}

export { createDeck, shuffle, deal };