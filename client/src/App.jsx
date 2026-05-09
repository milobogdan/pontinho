import { useState } from 'react';
import Lobby from './components/Lobby';
import Game from './components/Game';
import './App.css';

export default function App() {
  const [screen, setScreen] = useState('splash');
  const [roomInfo, setRoomInfo] = useState(null);

  function onGameStart(info) {
    setRoomInfo(info);
    setScreen('game');
  }

  if (screen === 'splash') return (
    <div style={{
      minHeight:'100vh', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      background:'radial-gradient(ellipse at 50% 30%, #1e6b42 0%, #0d3b22 100%)',
      padding:24, gap:24,
    }}>
      <img src="/pontinho.jpg" alt="Pontinho with Family"
        style={{ width:'100%', maxWidth:420, borderRadius:24,
          boxShadow:'0 20px 60px rgba(0,0,0,0.6)' }}
      />
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
        <button onClick={() => setScreen('lobby')} style={{
            fontFamily:"'Fredoka One',cursive",
            fontSize:28, padding:'16px 64px',
            background:'linear-gradient(135deg, #f9c55a, #f4a522)',
            color:'#3a1f00', border:'none', borderRadius:50,
            cursor:'pointer', letterSpacing:2,
            boxShadow:'0 6px 30px rgba(244,165,34,0.6)',
            animation:'bounce-in 0.6s ease',
          }}>
          🃏 PLAY!
        </button>
        <p style={{ opacity:0.5, fontSize:13, letterSpacing:1 }}>Pontinho with Family</p>
      </div>
    </div>
  );

  return (
    <div className="app">
      {screen === 'lobby' && <Lobby onGameStart={onGameStart} />}
      {screen === 'game'  && <Game roomInfo={roomInfo} />}
    </div>
  );
}