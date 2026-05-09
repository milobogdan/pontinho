const SUITS  = { hearts:'♥', diamonds:'♦', clubs:'♣', spades:'♠' };
const IS_RED = { hearts:true, diamonds:true, clubs:false, spades:false };

function CardBack({ small, onClick }) {
  const w = small ? 50 : 84;
  const h = small ? 72 : 120;
  return (
    <div onClick={onClick} style={{
      width:w, height:h, borderRadius:8, flexShrink:0,
      background:'linear-gradient(145deg,#1a5c38,#2d8a54)',
      border:'2px solid rgba(255,255,255,0.22)',
      cursor: onClick ? 'pointer' : 'default',
      position:'relative', overflow:'hidden',
      boxShadow:'0 3px 10px rgba(0,0,0,0.4)',
      transition:'transform 0.15s',
    }}
    onMouseEnter={e => { if(onClick) e.currentTarget.style.transform='translateY(-3px)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform='none'; }}>
      <div style={{ position:'absolute', inset:4, border:'1.5px solid rgba(255,215,0,0.28)', borderRadius:5 }} />
      <div style={{
        position:'absolute', top:'50%', left:'50%',
        transform:'translate(-50%,-50%) rotate(45deg)',
        width: small?18:26, height: small?18:26,
        background:'rgba(255,215,0,0.18)',
        borderRadius:3, border:'1px solid rgba(255,215,0,0.35)',
      }} />
    </div>
  );
}

export default function Card({ card, selected, onClick, small }) {
  if (!card || card.hidden) return <CardBack small={small} onClick={onClick} />;

  const w = small ? 48 : 70;
  const h = small ? 68 : 100;

  if (card.isJoker) return (
    <div onClick={onClick} style={{
      width:w, height:h, borderRadius:8, flexShrink:0,
      background: selected ? '#fff9e6' : '#fffef7',
      border: selected ? '3px solid #f4a522' : '2px solid #e0ddd4',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      cursor: onClick ? 'pointer' : 'default',
      transform: selected ? 'translateY(-14px)' : 'none',
      transition:'all 0.15s',
      boxShadow: selected ? '0 8px 22px rgba(244,165,34,0.55)' : '0 3px 10px rgba(0,0,0,0.2)',
      userSelect:'none',
    }}>
      <span style={{ fontSize: small?22:32 }}>🃏</span>
      {!small && <span style={{ fontSize:9, color:'#999', fontWeight:800, letterSpacing:1.5 }}>JOKER</span>}
    </div>
  );

  const suit  = SUITS[card.suit] || card.suit;
  const color = IS_RED[card.suit] ? '#e63946' : '#1d1d2e';

  return (
    <div onClick={onClick} style={{
      width:w, height:h, borderRadius:8, flexShrink:0,
      background: selected ? '#fff9e6' : '#fffef7',
      border: selected ? '3px solid #f4a522' : '2px solid #e0ddd4',
      position:'relative',
      cursor: onClick ? 'pointer' : 'default', color,
      transform: selected ? 'translateY(-14px)' : 'none',
      transition:'all 0.15s',
      boxShadow: selected ? '0 8px 22px rgba(244,165,34,0.55)' : '0 3px 10px rgba(0,0,0,0.2)',
      userSelect:'none',
    }}>
      {/* Top-left corner */}
      <div style={{ position:'absolute', top:4, left:5, lineHeight:1.1, textAlign:'center' }}>
        <div style={{ fontSize: small?12:14, fontWeight:900, lineHeight:1 }}>{card.rank}</div>
        <div style={{ fontSize: small?11:12, lineHeight:1 }}>{suit}</div>
      </div>

      {/* Center large suit — full size only */}
      {!small && (
        <div style={{
          position:'absolute', top:'50%', left:'50%',
          transform:'translate(-50%,-50%)',
          fontSize:36, lineHeight:1,
        }}>
          {suit}
        </div>
      )}

      {/* Bottom-right corner (rotated 180°) — full size only */}
      {!small && (
        <div style={{
          position:'absolute', bottom:4, right:5,
          transform:'rotate(180deg)', lineHeight:1.1, textAlign:'center',
        }}>
          <div style={{ fontSize:14, fontWeight:900, lineHeight:1 }}>{card.rank}</div>
          <div style={{ fontSize:12, lineHeight:1 }}>{suit}</div>
        </div>
      )}
    </div>
  );
}