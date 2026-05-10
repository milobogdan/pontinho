// ── AVATAR REGISTRY ───────────────────────────────────────────────────────

export const AVATAR_LIST = [
  { id: 'sporty',   label: 'Marco'  },
  { id: 'nerdy',    label: 'Theo'   },
  { id: 'cool',     label: 'Diego'  },
  { id: 'grandpa',  label: 'João'   },
  { id: 'kid',      label: 'Luca'   },
  { id: 'curly',    label: 'Bia'    },
  { id: 'ponytail', label: 'Sara'   },
  { id: 'grandma',  label: 'Vovó'   },
  { id: 'business', label: 'Ana'    },
  { id: 'pigtails', label: 'Mia'    },
];

// Bots get random avatars
export function randomBotAvatar(usedIds = []) {
  const available = AVATAR_LIST.map(a => a.id).filter(id => !usedIds.includes(id));
  const pool = available.length > 0 ? available : AVATAR_LIST.map(a => a.id);
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── AVATAR COMPONENT ──────────────────────────────────────────────────────

export function Avatar({ id, size = 44 }) {
  return (
    <div style={{
      width: size, height: size,
      flexShrink: 0, display: 'inline-block',
    }}>
      <img
        src={`/avatars/${id || 'sporty'}.png`}
        alt={id}
        draggable={false}
        style={{ width:'100%', height:'100%', objectFit:'contain', display:'block', pointerEvents:'none' }}
      />
    </div>
  );
}

// ── AVATAR PICKER ─────────────────────────────────────────────────────────

export function AvatarPicker({ selected, onSelect }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', width:'100%', textAlign:'center' }}>
      <p style={{ fontSize:13, opacity:0.7, marginBottom:12, textAlign:'center' }}>
        Choose your avatar
      </p>
      <div style={{
        display:'flex', flexWrap:'wrap', gap:12,
        justifyContent:'center',
        margin:'0 auto',
        padding:'0 8px',
      }}>
        {AVATAR_LIST.map(av => (
          <div key={av.id} onClick={() => onSelect(av.id)}
            style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, cursor:'pointer' }}>
            <div style={{
              width:70, height:70,
              border: selected === av.id ? '3px solid #f4a522' : '3px solid transparent',
              borderRadius:'50%',
              transform: selected === av.id ? 'scale(1.15)' : 'scale(1)',
              transition:'all 0.2s',
              boxShadow: selected === av.id ? '0 0 18px rgba(244,165,34,0.65)' : 'none',
            }}>
              <Avatar id={av.id} size={64} />
            </div>
            <span style={{
              fontSize:10, fontWeight: selected === av.id ? 700 : 400,
              opacity: selected === av.id ? 1 : 0.5,
              color: selected === av.id ? '#f4a522' : '#fff',
            }}>
              {av.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
