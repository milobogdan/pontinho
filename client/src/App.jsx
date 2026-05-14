import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Lobby from './components/Lobby';
import Game from './components/Game';
import T, { RULES_CONTENT } from './translations';
import socket from './socket';
import './App.css';

const LANGUAGES = {
  pt: { code: 'pt', flag: '🇧🇷', label: 'PT' },
  en: { code: 'en', flag: '🇬🇧', label: 'EN' },
  ro: { code: 'ro', flag: '🇷🇴', label: 'RO' },
};

export default function App() {
  const [screen, setScreen]     = useState('splash');
  const [roomInfo, setRoomInfo] = useState(null);
  const [lang, setLang]         = useState('en');
  const [showRules, setShowRules] = useState(false);
  const [pendingRejoin, setPendingRejoin] = useState(null);

  const t = T[lang];
  const rules = RULES_CONTENT[lang];

  // Check for stored session on mount
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('pontinho_rejoin'));
      if (stored?.code && stored?.playerId) setPendingRejoin(stored);
    } catch {}
  }, []);

  function onGameStart(info) {
    setRoomInfo(info);
    setScreen('game');
    localStorage.setItem('pontinho_rejoin', JSON.stringify({ code: info.code, playerId: info.playerId }));
  }

  function handleRejoin() {
    if (!pendingRejoin) return;
    socket.emit('rejoinRoom', { roomCode: pendingRejoin.code, playerId: pendingRejoin.playerId }, (res) => {
      if (res?.error) {
        localStorage.removeItem('pontinho_rejoin');
        setPendingRejoin(null);
      } else {
        setRoomInfo({ code: pendingRejoin.code, playerId: pendingRejoin.playerId });
        setScreen('game');
        setPendingRejoin(null);
      }
    });
  }

  function dismissRejoin() {
    localStorage.removeItem('pontinho_rejoin');
    setPendingRejoin(null);
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

      {/* Rejoin banner */}
      <AnimatePresence>
        {pendingRejoin && (
          <motion.div
            initial={{ opacity:0, y:-20 }}
            animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, y:-20 }}
            style={{
              position:'absolute', top:16, left:16,
              zIndex:10, background:'rgba(244,165,34,0.15)',
              border:'1px solid rgba(244,165,34,0.5)',
              backdropFilter:'blur(12px)',
              borderRadius:16, padding:'10px 16px',
              display:'flex', alignItems:'center', gap:10,
              whiteSpace:'nowrap',
            }}>
            <span style={{ fontSize:13, fontWeight:700, color:'#f4a522' }}>
              You were in a game!
            </span>
            <button onClick={handleRejoin} style={{
              background:'#f4a522', border:'none', borderRadius:20,
              padding:'5px 14px', fontWeight:800, fontSize:12,
              color:'#1a1a1a', cursor:'pointer',
            }}>Rejoin</button>
            <button onClick={dismissRejoin} style={{
              background:'rgba(255,255,255,0.1)', border:'none', borderRadius:20,
              padding:'5px 10px', fontWeight:700, fontSize:12,
              color:'rgba(255,255,255,0.6)', cursor:'pointer',
            }}>✕</button>
          </motion.div>
        )}
      </AnimatePresence>

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
      {screen === 'lobby' && <Lobby onGameStart={onGameStart} lang={lang} />}
      {screen === 'game'  && <Game roomInfo={roomInfo} onLeave={() => { localStorage.removeItem('pontinho_rejoin'); setScreen('splash'); }} lang={lang} />}
    </div>
  );
}