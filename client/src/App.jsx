import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Lobby from './components/Lobby';
import Game from './components/Game';
import './App.css';

const LANGUAGES = {
  pt: { code: 'pt', flag: '🇧🇷', label: 'PT' },
  en: { code: 'en', flag: '🇬🇧', label: 'EN' },
  ro: { code: 'ro', flag: '🇷🇴', label: 'RO' },
};

const TRANSLATIONS = {
  pt: {
    play: 'JOGAR',
    rules: '📖 Regras',
    rulesTitle: '📖 Regras do Jogo',
    close: 'Fechar',
    subtitle: 'com a Família',
  },
  en: {
    play: 'PLAY',
    rules: '📖 Rules',
    rulesTitle: '📖 Game Rules',
    close: 'Close',
    subtitle: 'with Family',
  },
  ro: {
    play: 'JOACĂ',
    rules: '📖 Reguli',
    rulesTitle: '📖 Regulile Jocului',
    close: 'Închide',
    subtitle: 'cu Familia',
  },
};

const RULES_CONTENT = {
  en: [
    { title: '🃏 Setup', content: '108 cards (2 decks + 4 Jokers). Each player gets 9 cards. One card starts the discard pile.' },
    { title: '🎯 Goal', content: 'Be first to empty your hand. Others count remaining cards as points. Hit 200+ points and you explode! Explode twice — eliminated!' },
    { title: '🔄 Your Turn', content: 'Draw from pile OR pick up top discard (only if you can use it in a run). Play melds, extend existing ones, then discard to end turn.' },
    { title: '🃏 First Turn', content: 'First player draws and can keep or discard & redraw. You cannot discard Jokers!' },
    { title: '📦 Sets', content: '3 cards same rank, all different suits. No Jokers. Extend up to 6 cards (max 2 per suit).' },
    { title: '🏃 Runs', content: '3+ sequential same-suit cards. Joker in middle only (max 1 per run). When winning, Joker can be at start or end.' },
    { title: '🛑 STOP!', content: 'Tap the discard card on another player\'s turn to call STOP! You have 2 minutes to play all your cards. Fail = false STOP penalty!' },
    { title: '💥 Explosion', content: 'First 200+ pts: score resets to highest opponent\'s score. Second time: eliminated! Last player wins.' },
    { title: '🃏 Card Values', content: '2-K = face value. Ace = 1 (or 14 with multiple Aces). Joker = 50 pts.' },
  ],
  pt: [
    { title: '🃏 Configuração', content: '108 cartas (2 baralhos + 4 Jokers). Cada jogador recebe 9 cartas.' },
    { title: '🎯 Objetivo', content: 'Ser o primeiro a esvaziar a mão. Os outros contam as cartas restantes como pontos. 200+ pontos = explosão! Exploda duas vezes = eliminado!' },
    { title: '🔄 Sua Vez', content: 'Compre do monte OU pegue o descarte (só se usar em uma sequência). Jogue combinações, estenda existentes, depois descarte.' },
    { title: '🃏 Primeira Vez', content: 'O primeiro jogador compra e pode manter ou descartar e comprar novamente. Não pode descartar Jokers!' },
    { title: '📦 Trincas', content: '3 cartas do mesmo valor, todos naipes diferentes. Sem Jokers. Estenda até 6 cartas (máx 2 por naipe).' },
    { title: '🏃 Sequências', content: '3+ cartas seguidas do mesmo naipe. Joker só no meio (máx 1 por sequência). Ao vencer, Joker pode estar no início ou fim.' },
    { title: '🛑 STOP!', content: 'Toque na carta descartada na vez do outro para chamar STOP! Você tem 2 minutos para jogar todas as cartas. Falhar = penalidade!' },
    { title: '💥 Explosão', content: 'Primeiro 200+ pts: pontuação reseta. Segunda vez: eliminado! Último jogador vence.' },
    { title: '🃏 Valores', content: '2-K = valor nominal. Ás = 1 (ou 14 com múltiplos Ases). Joker = 50 pts.' },
  ],
  ro: [
    { title: '🃏 Pregătire', content: 'Jocul folosește 108 cărți (2 pachete + 4 Jokeri). Fiecare jucător primește câte 9 cărți. O carte este întoarsă pe față pentru a începe teancul de cărți decartate.' },
    { title: '🎯 Scopul Jocului', content: 'Fii primul care își golește mâna. Ceilalți jucători își numără cărțile rămase ca puncte. Dacă atingi 200+ puncte, explodezi! Cine explodează de două ori este eliminat.' },
    { title: '🔄 Turul Tău', content: 'Trage o carte din pachet SAU ia ultima carte decartată (doar dacă o poți folosi imediat într-o suită). Joacă formații noi, extinde-le pe cele existente, apoi decartează o carte.' },
    { title: '🃏 Prima Tură', content: 'Primul jucător trage o carte și poate alege să o păstreze sau să o decarteze și să tragă alta. Atenție: Jokerii nu pot fi decartați!' },
    { title: '📦 Seturi', content: '3 cărți de același rang, cu toate culorile diferite. Fără Jokeri. Extensibil până la 6 cărți (cel mult 2 din fiecare culoare).' },
    { title: '🏃 Suite', content: '3+ cărți consecutive de aceeași culoare. Jokerul doar la mijloc (max 1 per suită). La câștig, Jokerul poate fi și la început sau la sfârșit.' },
    { title: '🛑 STOP!', content: 'Atinge cartea decartată în tura altui jucător pentru a striga STOP! Ai 2 minute să îți joci toate cărțile. Dacă eșuezi, primești penalizare pentru STOP fals!' },
    { title: '💥 Explozia', content: 'Prima dată la 200+ puncte: scorul se resetează la valoarea celui mai mare scor al unui adversar. A doua oară: ești eliminat! Ultimul rămas câștigă.' },
    { title: '🃏 Valoarea Cărților', content: '2–K: valoarea nominală. As: 1 punct (sau 14 cu mai mulți Ași). Joker: 50 de puncte.' },
  ],
};

export default function App() {
  const [screen, setScreen]     = useState('splash');
  const [roomInfo, setRoomInfo] = useState(null);
  const [lang, setLang]         = useState('en');
  const [showRules, setShowRules] = useState(false);

  const t = TRANSLATIONS[lang];
  const rules = RULES_CONTENT[lang];

  function onGameStart(info) {
    setRoomInfo(info);
    setScreen('game');
  }

  // ── SPLASH ────────────────────────────────────────────────────
  if (screen === 'splash') return (
    <div style={{ position:'fixed', inset:0, overflow:'hidden' }}>

      {/* Blurred background */}
      <div style={{
        position:'absolute', inset:'-20px',
        backgroundImage:'url(/pontinho.jpg)',
        backgroundSize:'cover',
        backgroundPosition:'center',
        filter:'blur(20px) brightness(0.4)',
        transform:'scale(1.1)',
      }} />

      {/* Main image centered and fully visible */}
      <div style={{
        position:'absolute', inset:0,
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <img
          src="/pontinho.jpg"
          alt="Pontinho with Family"
          style={{
            maxHeight:'92vh',
            maxWidth:'92vw',
            objectFit:'contain',
            position:'relative', zIndex:1,
            borderRadius:24,
            boxShadow:'0 20px 60px rgba(0,0,0,0.5)',
          }}
        />
      </div>

      {/* Bottom gradient overlay */}
      <div style={{
        position:'absolute', bottom:0, left:0, right:0,
        height:'55%', zIndex:2,
        background:'linear-gradient(to top, rgba(10,30,15,0.98) 0%, rgba(10,30,15,0.7) 50%, transparent 100%)',
      }} />

      {/* Language toggle — top right */}
      <motion.div
        initial={{ opacity:0, y:-10 }}
        animate={{ opacity:1, y:0 }}
        transition={{ delay:0.3 }}
        style={{
          position:'absolute', top:16, right:16, zIndex:10,
          display:'flex', gap:6,
        }}>
        {Object.values(LANGUAGES).map(l => (
          <button key={l.code} onClick={() => setLang(l.code)} style={{
            padding:'5px 10px', borderRadius:20,
            border: lang === l.code ? '2px solid #f4a522' : '1px solid rgba(255,255,255,0.2)',
            background: lang === l.code ? 'rgba(244,165,34,0.2)' : 'rgba(0,0,0,0.3)',
            color: lang === l.code ? '#f4a522' : 'rgba(255,255,255,0.6)',
            cursor:'pointer', fontSize:12, fontWeight:700,
            backdropFilter:'blur(10px)',
            transition:'all 0.2s',
          }}>
            {l.flag} {l.label}
          </button>
        ))}
      </motion.div>

      {/* Buttons — bottom */}
      <div style={{
        position:'absolute', bottom:0, left:0, right:0,
        zIndex:3, display:'flex', flexDirection:'column',
        alignItems:'center', gap:12, padding:'0 24px 48px',
      }}>
        <motion.button
          initial={{ opacity:0, y:30 }}
          animate={{ opacity:1, y:0 }}
          transition={{ delay:0.4, type:'spring', bounce:0.4 }}
          whileHover={{ scale:1.05 }}
          whileTap={{ scale:0.95 }}
          onClick={() => setScreen('lobby')}
          style={{
            width:'100%', maxWidth:360,
            padding:'18px', borderRadius:50, border:'none',
            background:'linear-gradient(135deg, #f9c55a, #f4a522)',
            fontFamily:"'Nunito', sans-serif",
            fontSize:28, fontWeight:800, letterSpacing:1,
            WebkitTextFillColor:'#3a1f00',
            cursor:'pointer',
            boxShadow:'0 8px 32px rgba(244,165,34,0.5)',
          }}>
          {t.play}
        </motion.button>

        <motion.button
          initial={{ opacity:0, y:20 }}
          animate={{ opacity:1, y:0 }}
          transition={{ delay:0.5 }}
          whileHover={{ scale:1.03 }}
          whileTap={{ scale:0.97 }}
          onClick={() => setShowRules(true)}
          style={{
            width:'100%', maxWidth:360,
            padding:'12px', borderRadius:50,
            border:'2px solid rgba(255,255,255,0.25)',
            background:'rgba(255,255,255,0.08)',
            color:'rgba(255,255,255,0.85)',
            fontFamily:"'Fredoka One',cursive",
            fontSize:18, cursor:'pointer',
            backdropFilter:'blur(10px)',
            boxShadow:'0 4px 16px rgba(0,0,0,0.3)',
          }}>
          {t.rules}
        </motion.button>
      </div>

      {/* Rules panel — slides up from bottom */}
      <AnimatePresence>
        {showRules && (
          <>
            <motion.div
              initial={{ opacity:0 }}
              animate={{ opacity:1 }}
              exit={{ opacity:0 }}
              onClick={() => setShowRules(false)}
              style={{
                position:'fixed', inset:0, zIndex:20,
                background:'rgba(0,0,0,0.6)',
              }}
            />
            <motion.div
              initial={{ y:'100%' }}
              animate={{ y:0 }}
              exit={{ y:'100%' }}
              transition={{ type:'spring', damping:25, stiffness:200 }}
              style={{
                position:'fixed', bottom:0, left:0, right:0, zIndex:21,
                background:'linear-gradient(180deg, #0f4a2a 0%, #0a2a15 100%)',
                borderRadius:'24px 24px 0 0',
                maxHeight:'80vh',
                display:'flex', flexDirection:'column',
                boxShadow:'0 -8px 40px rgba(0,0,0,0.5)',
              }}>

              {/* Handle */}
              <div style={{ display:'flex', justifyContent:'center', padding:'12px 0 0' }}>
                <div style={{ width:40, height:4, borderRadius:2,
                  background:'rgba(255,255,255,0.2)' }} />
              </div>

              {/* Header */}
              <div style={{
                display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'12px 20px 8px',
                borderBottom:'1px solid rgba(255,255,255,0.08)',
              }}>
                <h2 style={{ fontFamily:"'Fredoka One',cursive",
                  fontSize:22, color:'#f4a522', margin:0 }}>
                  {t.rulesTitle}
                </h2>
                <button onClick={() => setShowRules(false)} style={{
                  background:'rgba(255,255,255,0.1)', border:'none',
                  color:'#fff', borderRadius:'50%', width:32, height:32,
                  cursor:'pointer', fontSize:16, display:'flex',
                  alignItems:'center', justifyContent:'center',
                }}>✕</button>
              </div>

              {/* Rules content */}
              <div style={{ flex:1, overflowY:'auto', padding:'16px 20px 32px',
                display:'flex', flexDirection:'column', gap:12 }}>
                {rules.map((rule, i) => (
                  <motion.div key={i}
                    initial={{ opacity:0, x:-10 }}
                    animate={{ opacity:1, x:0 }}
                    transition={{ delay: i * 0.05 }}
                    style={{
                      background:'rgba(255,255,255,0.05)',
                      borderRadius:12, padding:'12px 14px',
                      border:'1px solid rgba(255,255,255,0.06)',
                    }}>
                    <div style={{ fontWeight:800, fontSize:13,
                      color:'#f4a522', marginBottom:4 }}>
                      {rule.title}
                    </div>
                    <div style={{ fontSize:13, opacity:0.8, lineHeight:1.5 }}>
                      {rule.content}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );

  // ── LOBBY / GAME ──────────────────────────────────────────────
  return (
    <div className="app">
      {screen === 'lobby' && <Lobby onGameStart={onGameStart} />}
      {screen === 'game'  && <Game roomInfo={roomInfo} onLeave={() => setScreen('splash')} />}
    </div>
  );
}