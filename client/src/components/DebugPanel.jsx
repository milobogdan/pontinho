import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import socket from '../socket';

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUIT_SYMBOLS = { spades:'♠', hearts:'♥', diamonds:'♦', clubs:'♣' };
const SUIT_COLORS  = { spades:'#1d1d2e', hearts:'#e63946', diamonds:'#e63946', clubs:'#1d1d2e' };

// Generate a full deck
function fullDeck() {
  const cards = [];
  let id = 9000;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const value = rank === 'A' ? 1 : rank === 'J' ? 11 : rank === 'Q' ? 12 : rank === 'K' ? 13 : parseInt(rank);
      cards.push({ id: `debug-${id++}`, suit, rank, value, isJoker: false });
    }
  }
  cards.push({ id: `debug-${id++}`, isJoker: true, rank: 'JOKER', suit: null, value: 50 });
  cards.push({ id: `debug-${id++}`, isJoker: true, rank: 'JOKER', suit: null, value: 50 });
  return cards;
}

const SCENARIOS = [
  {
    name: '🃏 Win with set',
    desc: 'Have 2 fours + discard is 4 — pick the discard to win',
    hand: [
      { id:'d1', suit:'spades',   rank:'4', value:4 },
      { id:'d2', suit:'hearts',   rank:'4', value:4 },
    ],
    discard: { id:'d3', suit:'diamonds', rank:'4', value:4 },
    phase: 'draw',
  },
  {
    name: '🏃 Joker at end of run',
    desc: 'Q K A + Joker should extend',
    hand: [{ id:'d1', isJoker:true, rank:'JOKER', value:50 }],
    melds: [{
      id:'meld-1', type:'run', ownerId:'debug',
      cards: [
        { id:'d2', suit:'hearts', rank:'Q', value:12 },
        { id:'d3', suit:'hearts', rank:'K', value:13 },
        { id:'d4', suit:'hearts', rank:'A', value:1  },
      ]
    }],
  },
  {
    name: '🛑 STOP winning hand',
    desc: '2 runs ready to go down',
    hand: [
      { id:'d1', suit:'spades', rank:'2', value:2 },
      { id:'d2', suit:'spades', rank:'3', value:3 },
      { id:'d3', suit:'spades', rank:'4', value:4 },
      { id:'d4', suit:'hearts', rank:'7', value:7 },
      { id:'d5', suit:'hearts', rank:'8', value:8 },
      { id:'d6', suit:'hearts', rank:'9', value:9 },
    ],
    discard: { id:'d7', suit:'clubs', rank:'5', value:5 },
  },
  {
    name: '🃏 Joker steal',
    desc: 'Table has joker in run you can steal',
    hand: [{ id:'d1', suit:'hearts', rank:'5', value:5 }],
    melds: [{
      id:'meld-1', type:'run', ownerId:'debug',
      cards: [
        { id:'d2', suit:'hearts', rank:'4', value:4 },
        { id:'d3', isJoker:true, rank:'JOKER', value:50 },
        { id:'d4', suit:'hearts', rank:'6', value:6 },
      ]
    }],
  },
  {
    name: '🃏 First turn Joker',
    desc: 'You are first player, drew a Joker — must keep it',
    hand: [{ id:'d1', isJoker:true, rank:'JOKER', suit:null, value:50 }],
    phase: 'firstKeepOrDiscard',
  },
  {
    name: '💥 One card left',
    desc: 'Only Joker in hand',
    hand: [{ id:'d1', isJoker:true, rank:'JOKER', value:50 }],
    melds: [{
      id:'meld-1', type:'run', ownerId:'debug',
      cards: [
        { id:'d2', suit:'spades', rank:'9',  value:9  },
        { id:'d3', suit:'spades', rank:'10', value:10 },
        { id:'d4', suit:'spades', rank:'J',  value:11 },
        { id:'d5', suit:'spades', rank:'Q',  value:12 },
      ]
    }],
  },
];

function MiniCard({ card, selected, onClick }) {
  if (!card) return null;
  if (card.isJoker) return (
    <div onClick={onClick} style={{
      width:36, height:50, borderRadius:5, background: selected ? '#fff9e6' : '#fff',
      border: selected ? '2px solid #f4a522' : '1px solid #ccc',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:18, cursor:'pointer', flexShrink:0,
      boxShadow: selected ? '0 0 8px rgba(244,165,34,0.6)' : '0 1px 3px rgba(0,0,0,0.2)',
    }}>🃏</div>
  );
  const suitCode = { spades:'S', hearts:'H', diamonds:'D', clubs:'C' };
  const rankCode = card.rank === '10' ? '0' : card.rank;
  return (
    <div onClick={onClick} style={{
      width:36, height:50, borderRadius:5, overflow:'hidden',
      border: selected ? '2px solid #f4a522' : '1px solid #ccc',
      cursor:'pointer', flexShrink:0,
      boxShadow: selected ? '0 0 8px rgba(244,165,34,0.6)' : '0 1px 3px rgba(0,0,0,0.2)',
      transform: selected ? 'translateY(-4px)' : 'none',
      transition:'all 0.15s',
    }}>
      <img src={`/cards/${rankCode}${suitCode[card.suit]}.png`}
        style={{ width:'100%', height:'100%', objectFit:'cover' }} />
    </div>
  );
}

export default function DebugPanel({ gameState, roomInfo }) {
  const [open, setOpen]           = useState(false);
  const [tab, setTab]             = useState('hand'); // 'hand' | 'scenarios'
  const [selectedCards, setSelectedCards] = useState([]);
  const [discardCard, setDiscardCard]     = useState(null);
  const [msg, setMsg]             = useState('');

  const deck = fullDeck();

  function showMsg(text) {
    setMsg(text);
    setTimeout(() => setMsg(''), 2500);
  }

  function toggleCard(card) {
    setSelectedCards(prev =>
      prev.find(c => c.id === card.id)
        ? prev.filter(c => c.id !== card.id)
        : [...prev, { ...card, id: `debug-hand-${card.id}` }]
    );
  }

  function setDiscard(card) {
    setDiscardCard(prev =>
      prev?.id === card.id ? null : { ...card, id: `debug-discard-${card.id}` }
    );
  }

  function applyHand() {
    if (selectedCards.length === 0) return showMsg('Select cards first!');
    socket.emit('debugSetState', { hand: selectedCards }, (res) => {
      if (res?.error) showMsg(`❌ ${res.error}`);
      else { showMsg(`✅ Hand set to ${selectedCards.length} cards!`); setSelectedCards([]); }
    });
  }

  function applyDiscard() {
    if (!discardCard) return showMsg('Select a discard card first!');
    socket.emit('debugSetState', { discardCard }, (res) => {
      if (res?.error) showMsg(`❌ ${res.error}`);
      else { showMsg(`✅ Discard set!`); setDiscardCard(null); }
    });
  }

  function applyScenario(scenario) {
    const payload = {};
    if (scenario.hand)    payload.hand    = scenario.hand;
    if (scenario.discard) payload.discardCard = scenario.discard;
    if (scenario.melds)   payload.melds   = scenario.melds;
    payload.phase = scenario.phase ?? 'play';
    socket.emit('debugSetState', payload, (res) => {
      if (res?.error) showMsg(`❌ ${res.error}`);
      else showMsg(`✅ Scenario loaded!`);
    });
  }

  function skipToPlay() {
    socket.emit('debugSetState', { phase: 'play' }, (res) => {
      if (res?.error) showMsg(`❌ ${res.error}`);
      else showMsg('✅ Skipped to play phase!');
    });
  }

  return (
    <>
      {/* Debug button */}
      <div style={{
        position:'fixed', bottom:80, right:16, zIndex:600,
      }}>
        <button onClick={() => setOpen(prev => !prev)} style={{
          width:44, height:44, borderRadius:'50%',
          background: open ? '#e63946' : '#2d2d2d',
          border:'2px solid rgba(255,255,255,0.3)',
          color:'#fff', fontSize:18, cursor:'pointer',
          boxShadow:'0 4px 12px rgba(0,0,0,0.4)',
        }}>
          🔧
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity:0, x:320 }}
            animate={{ opacity:1, x:0 }}
            exit={{ opacity:0, x:320 }}
            transition={{ type:'spring', damping:25 }}
            style={{
              position:'fixed', top:0, right:0, bottom:0,
              width:320, zIndex:599,
              background:'#1a1a2e',
              borderLeft:'1px solid rgba(255,255,255,0.1)',
              display:'flex', flexDirection:'column',
              boxShadow:'-4px 0 20px rgba(0,0,0,0.5)',
            }}>

            {/* Header */}
            <div style={{
              padding:'16px', borderBottom:'1px solid rgba(255,255,255,0.1)',
              display:'flex', justifyContent:'space-between', alignItems:'center',
            }}>
              <span style={{ fontFamily:"'Fredoka One',cursive", fontSize:18, color:'#f4a522' }}>
                🔧 Debug Panel
              </span>
              <button onClick={() => setOpen(false)} style={{
                background:'none', border:'none', color:'rgba(255,255,255,0.5)',
                fontSize:18, cursor:'pointer',
              }}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display:'flex', padding:'8px 16px', gap:8 }}>
              {['hand','discard','scenarios'].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  flex:1, padding:'6px', borderRadius:8, border:'none',
                  background: tab === t ? '#f4a522' : 'rgba(255,255,255,0.1)',
                  color: tab === t ? '#1a1a1a' : '#fff',
                  cursor:'pointer', fontSize:12, fontWeight:700,
                  textTransform:'capitalize',
                }}>
                  {t}
                </button>
              ))}
            </div>

            {/* Message */}
            {msg && (
              <div style={{ margin:'0 16px', padding:'8px 12px', borderRadius:8,
                background:'rgba(244,165,34,0.15)', color:'#f4a522',
                fontSize:12, fontWeight:700, textAlign:'center' }}>
                {msg}
              </div>
            )}

            {/* Current hand */}
            <div style={{ padding:'8px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize:11, opacity:0.5, marginBottom:6 }}>
                CURRENT HAND ({gameState?.players?.find(p => p.id === roomInfo?.playerId)?.hand?.length ?? 0} cards):
              </p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                {(gameState?.players?.find(p => p.id === roomInfo?.playerId)?.hand || []).map(c => (
                  <MiniCard key={c.id} card={c} />
                ))}
              </div>
            </div>

            {/* SET HAND tab */}
            {tab === 'hand' && (
              <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
                <div style={{ padding:'8px 16px 4px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <p style={{ fontSize:11, opacity:0.5 }}>
                    PICK CARDS FOR YOUR HAND ({selectedCards.length} selected):
                  </p>
                  {selectedCards.length > 0 && (
                    <button onClick={() => setSelectedCards([])} style={{
                      background:'none', border:'none', color:'rgba(255,255,255,0.4)',
                      cursor:'pointer', fontSize:11,
                    }}>clear</button>
                  )}
                </div>

                {/* Selected preview */}
                {selectedCards.length > 0 && (
                  <div style={{ padding:'0 16px 8px', display:'flex', gap:4, flexWrap:'wrap' }}>
                    {selectedCards.map(c => <MiniCard key={c.id} card={c} selected />)}
                  </div>
                )}

                <div style={{ flex:1, overflowY:'auto', padding:'0 16px 16px' }}>
                  {/* Jokers */}
                  <p style={{ fontSize:11, opacity:0.4, margin:'8px 0 4px' }}>JOKERS</p>
                  <div style={{ display:'flex', gap:4, marginBottom:8 }}>
                    {deck.filter(c => c.isJoker).map(c => (
                      <MiniCard key={c.id} card={c}
                        selected={!!selectedCards.find(s => s.rank === 'JOKER' && s.suit === null)}
                        onClick={() => toggleCard(c)} />
                    ))}
                  </div>

                  {SUITS.map(suit => (
                    <div key={suit}>
                      <p style={{ fontSize:11, color: SUIT_COLORS[suit] === '#e63946' ? '#e63946' : 'rgba(255,255,255,0.4)',
                        margin:'8px 0 4px' }}>
                        {SUIT_SYMBOLS[suit]} {suit.toUpperCase()}
                      </p>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:4 }}>
                        {deck.filter(c => c.suit === suit).map(c => (
                          <MiniCard key={c.id} card={c}
                            selected={!!selectedCards.find(s => s.rank === c.rank && s.suit === c.suit)}
                            onClick={() => toggleCard(c)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ padding:16, borderTop:'1px solid rgba(255,255,255,0.08)' }}>
                  <button onClick={applyHand} style={{
                    width:'100%', padding:'12px', borderRadius:50, border:'none',
                    background: selectedCards.length > 0 ? 'linear-gradient(135deg,#f9c55a,#f4a522)' : 'rgba(255,255,255,0.1)',
                    color: selectedCards.length > 0 ? '#1a1a1a' : 'rgba(255,255,255,0.3)',
                    fontWeight:800, cursor: selectedCards.length > 0 ? 'pointer' : 'default',
                    fontSize:14,
                  }}>
                    ✅ Set Hand ({selectedCards.length} cards)
                  </button>
                </div>
              </div>
            )}

            {/* SET DISCARD tab */}
            {tab === 'discard' && (
              <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
                <div style={{ padding:'8px 16px 4px' }}>
                  <p style={{ fontSize:11, opacity:0.5 }}>PICK TOP DISCARD CARD:</p>
                  {discardCard && (
                    <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8 }}>
                      <MiniCard card={discardCard} selected />
                      <span style={{ fontSize:12, color:'#f4a522' }}>Selected</span>
                    </div>
                  )}
                </div>

                <div style={{ flex:1, overflowY:'auto', padding:'0 16px 16px' }}>
                  {SUITS.map(suit => (
                    <div key={suit}>
                      <p style={{ fontSize:11,
                        color: SUIT_COLORS[suit] === '#e63946' ? '#e63946' : 'rgba(255,255,255,0.4)',
                        margin:'8px 0 4px' }}>
                        {SUIT_SYMBOLS[suit]} {suit.toUpperCase()}
                      </p>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:4 }}>
                        {deck.filter(c => c.suit === suit).map(c => (
                          <MiniCard key={c.id} card={c}
                            selected={discardCard?.rank === c.rank && discardCard?.suit === c.suit}
                            onClick={() => setDiscard(c)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ padding:16, borderTop:'1px solid rgba(255,255,255,0.08)', display:'flex', gap:8 }}>
                  <button onClick={applyDiscard} style={{
                    flex:1, padding:'12px', borderRadius:50, border:'none',
                    background: discardCard ? 'linear-gradient(135deg,#f9c55a,#f4a522)' : 'rgba(255,255,255,0.1)',
                    color: discardCard ? '#1a1a1a' : 'rgba(255,255,255,0.3)',
                    fontWeight:800, cursor: discardCard ? 'pointer' : 'default', fontSize:14,
                  }}>
                    ✅ Set Discard
                  </button>
                  <button onClick={skipToPlay} style={{
                    flex:1, padding:'12px', borderRadius:50, border:'none',
                    background:'rgba(255,255,255,0.1)', color:'#fff',
                    fontWeight:800, cursor:'pointer', fontSize:13,
                  }}>
                    ⏭ Skip to Play
                  </button>
                </div>
              </div>
            )}

            {/* SCENARIOS tab */}
            {tab === 'scenarios' && (
              <div style={{ flex:1, overflowY:'auto', padding:16,
                display:'flex', flexDirection:'column', gap:10 }}>
                <p style={{ fontSize:11, opacity:0.5, marginBottom:4 }}>
                  PRESET TEST SCENARIOS — loads hand + state instantly:
                </p>
                {SCENARIOS.map((s, i) => (
                  <div key={i} style={{
                    background:'rgba(255,255,255,0.05)', borderRadius:12,
                    padding:'12px 14px', border:'1px solid rgba(255,255,255,0.08)',
                  }}>
                    <div style={{ fontWeight:800, fontSize:14, marginBottom:4 }}>{s.name}</div>
                    <div style={{ fontSize:12, opacity:0.6, marginBottom:10 }}>{s.desc}</div>
                    <button onClick={() => applyScenario(s)} style={{
                      width:'100%', padding:'8px', borderRadius:8, border:'none',
                      background:'rgba(244,165,34,0.2)', color:'#f4a522',
                      fontWeight:700, cursor:'pointer', fontSize:13,
                    }}>
                      Load Scenario
                    </button>
                  </div>
                ))}

                <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:12 }}>
                  <p style={{ fontSize:11, opacity:0.5, marginBottom:8 }}>QUICK ACTIONS:</p>
                  <button onClick={skipToPlay} style={{
                    width:'100%', padding:'10px', borderRadius:8, border:'none',
                    background:'rgba(255,255,255,0.08)', color:'#fff',
                    fontWeight:700, cursor:'pointer', fontSize:13, marginBottom:8,
                  }}>
                    ⏭ Skip to Play Phase
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}