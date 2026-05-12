const suitCode = { spades:'S', hearts:'H', diamonds:'D', clubs:'C' };

function CardBack({ small, medium, tiny, onClick }) {
  const isMobile = window.innerWidth < 600;
  const w = tiny ? 30 : small ? 48 : medium ? (isMobile ? 48 : 60) : (isMobile ? 62 : 84);
  const h = tiny ? 42 : small ? 68 : medium ? (isMobile ? 68 : 86) : (isMobile ? 90 : 120);
  return (
    <div onClick={onClick} style={{
      width:w, height:h, borderRadius:7, flexShrink:0,
      cursor: onClick ? 'pointer' : 'default',
      overflow:'hidden',
      WebkitTouchCallout:'none', WebkitUserSelect:'none',
      boxShadow:'0 3px 10px rgba(0,0,0,0.4)',
      transition:'transform 0.15s',
    }}
    onMouseEnter={e => { if(onClick) e.currentTarget.style.transform='translateY(-3px)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform='none'; }}>
      <img src="/cardback.jpg" alt="card back"
        draggable={false}
        style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', pointerEvents:'none' }} />
    </div>
  );
}

export default function Card({ card, selected, onClick, small, medium, tiny }) {
  if (!card || card.hidden) return <CardBack small={small} medium={medium} tiny={tiny} onClick={onClick} />;

  const isMobile = window.innerWidth < 600;
  const w = tiny ? 30 : small ? 48 : medium ? (isMobile ? 48 : 60) : (isMobile ? 62 : 84);
  const h = tiny ? 42 : small ? 68 : medium ? (isMobile ? 68 : 86) : (isMobile ? 90 : 120);

  if (card.isJoker) return (
    <div onClick={onClick} style={{
      width:w, height:h, borderRadius:7, flexShrink:0,
      background:'transparent',
      border: 'none',
      cursor: onClick ? 'pointer' : 'default',
      transform: selected ? 'translateY(-14px)' : 'none',
      transition:'all 0.15s',
      boxShadow: selected ? '0 8px 22px rgba(244,165,34,0.55)' : '0 3px 10px rgba(0,0,0,0.2)',
      overflow:'hidden', flexShrink:0,
      WebkitTouchCallout:'none', WebkitUserSelect:'none',
    }}>
      <img src="/cards/X1.png" alt="Joker"
        draggable={false}
        style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', pointerEvents:'none' }} />
    </div>
  );

  const rankCode = card.rank === '10' ? '0' : card.rank;
  const imgUrl = `/cards/${rankCode}${suitCode[card.suit]}.png`;

  return (
    <div onClick={onClick} style={{
      width:w, height:h, borderRadius:7, flexShrink:0,
      background:'transparent',
      border: 'none',
      cursor: onClick ? 'pointer' : 'default',
      transform: selected ? 'translateY(-14px)' : 'none',
      transition:'all 0.15s',
      boxShadow: selected ? '0 8px 22px rgba(244,165,34,0.55)' : '0 3px 10px rgba(0,0,0,0.2)',
      overflow:'hidden', flexShrink:0,
      WebkitTouchCallout:'none', WebkitUserSelect:'none',
    }}>
      <img
        src={imgUrl}
        alt={`${card.rank} of ${card.suit}`}
        draggable={false}
        style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', pointerEvents:'none' }}
      />
    </div>
  );
}