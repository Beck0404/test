const { useState, useEffect, useRef } = React;

/* =====================================================
 *  密室逃脫 · 古書房之謎
 *  第一人稱直式手機遊戲（繁體中文）
 *
 *  解謎流程：
 *  1. 西面書架：藍色書本後藏著「小鑰匙」；紅色書本提示「凝視時鐘」。
 *  2. 東面書桌：使用小鑰匙打開抽屜 → 拿到「泛黃紙條」；時鐘顯示 09:27。
 *  3. 南面油畫：點擊推開油畫 → 顯示保險箱 → 輸入 0927 → 取得「黃銅鑰匙」。
 *  4. 北面大門：使用黃銅鑰匙 → 逃脫成功！
 * ===================================================== */

const DIRECTIONS = ['北面 · 大門', '東面 · 書桌', '南面 · 油畫', '西面 · 書架'];
const COMPASS = ['北', '東', '南', '西'];

const ITEM_DATA = {
  smallKey: {
    name: '小鑰匙',
    icon: '🗝️',
    desc: '一把鏽跡斑斑的銅製小鑰匙。\n齒形精細，似乎能打開某個小鎖。',
  },
  paper: {
    name: '泛黃紙條',
    icon: '📜',
    desc: '紙條上以墨水寫著：\n\n「凝視時針所指，密碼自現。\n四個數字，便是寶藏的鑰匙。」',
  },
  doorKey: {
    name: '黃銅鑰匙',
    icon: '🔑',
    desc: '一把沉甸甸的古老黃銅鑰匙，\n鑰匙頭刻有繁複花紋。\n看起來能打開大門的鎖。',
  },
};

/* =====================================================
 *  通用元件
 * ===================================================== */
function Modal({ title, body, onClose, onConfirm, confirmLabel }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {body && <p>{body}</p>}
        <div className="modal-actions">
          {onConfirm && (
            <button className="primary-btn" onClick={onConfirm}>
              {confirmLabel || '確定'}
            </button>
          )}
          <button className="ghost-btn" onClick={onClose}>關閉</button>
        </div>
      </div>
    </div>
  );
}

function Keypad({ target, hint, onSubmit, onClose }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  const press = (n) => {
    if (code.length < 4) setCode(code + n);
    setError(false);
  };
  const clear = () => { setCode(''); setError(false); };
  const submit = () => {
    if (code.length < 4) return;
    if (code === target) {
      onSubmit();
    } else {
      setError(true);
      setTimeout(() => setCode(''), 700);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal keypad-modal" onClick={(e) => e.stopPropagation()}>
        <h3>輸入 4 位數密碼</h3>
        {hint && <p className="hint-text">{hint}</p>}
        <div className="code-display">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`code-digit${error ? ' error' : ''}`}>
              {code[i] || ''}
            </div>
          ))}
        </div>
        <p className="err-msg">{error ? '密碼錯誤，請再試一次' : ''}</p>
        <div className="keypad-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} className="key-btn" onClick={() => press(n)}>{n}</button>
          ))}
          <button className="key-btn small" onClick={clear}>清除</button>
          <button className="key-btn" onClick={() => press(0)}>0</button>
          <button className="key-btn small confirm" onClick={submit}>確認</button>
        </div>
        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}

/* =====================================================
 *  西面 · 書架
 * ===================================================== */
function WestScene({ flags, setFlag, addItem, showToast, setModal }) {
  const handleBook = (id) => {
    if (id === 'red') {
      setFlag('redBookRead');
      setModal({
        title: '紅色精裝書',
        body: '你翻開塵封已久的紅色書本，書頁中夾著一張字條：\n\n「時光無聲流逝，唯有鐘擺記載真相。\n當你迷失方向，凝視時鐘的指針。」',
      });
    } else if (id === 'blue') {
      if (!flags.keyFound) {
        addItem('smallKey');
        setFlag('keyFound');
        setModal({
          title: '發現新物品',
          body: '你抽出藍色精裝書，書本後面竟藏著一把小鑰匙！\n\n🗝️ 小鑰匙 已加入背包',
        });
      } else {
        showToast('藍色書本後已經沒有東西了');
      }
    } else if (id === 'gold') {
      setModal({
        title: '燙金詩集',
        body: '一本華麗的燙金詩集，其中一頁被人圈出：\n\n「四面之牆皆有所藏，\n畫中天地別有洞天。」',
      });
    } else if (id === 'green') {
      setModal({
        title: '綠皮植物誌',
        body: '一本講述古老植物學的書，內容平淡無奇⋯⋯',
      });
    } else if (id === 'brown') {
      setModal({ title: '棕色筆記本', body: '一本空白的舊筆記，未寫任何字句。' });
    } else if (id === 'purple') {
      setModal({ title: '紫色魔法書', body: '封面神秘，但翻開後只是普通的算術練習。' });
    } else if (id === 'black') {
      setModal({ title: '黑色皮裝書', body: '厚重的黑皮書，紙頁早已腐朽，無法閱讀。' });
    } else {
      showToast('一本普通的書，沒什麼特別');
    }
  };

  const Book = ({ x, y, w, h, color, stripe, id }) => (
    <g onClick={() => handleBook(id)} className="clickable">
      <rect x={x} y={y} width={w} height={h} fill={color} stroke="#0a0604" strokeWidth="0.6" />
      <rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
      {stripe && (
        <>
          <rect x={x + 2} y={y + 8} width={w - 4} height="2.5" fill={stripe} />
          <rect x={x + 2} y={y + h - 14} width={w - 4} height="2.5" fill={stripe} />
        </>
      )}
    </g>
  );

  return (
    <svg viewBox="0 0 360 600" className="scene-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="wallW" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a1e" />
          <stop offset="1" stopColor="#15100a" />
        </linearGradient>
        <linearGradient id="woodW" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5b3a22" />
          <stop offset="0.5" stopColor="#704214" />
          <stop offset="1" stopColor="#3d2613" />
        </linearGradient>
      </defs>
      <rect width="360" height="600" fill="url(#wallW)" />
      {/* 地板 */}
      <rect y="510" width="360" height="90" fill="#0e0805" />
      <line x1="0" y1="510" x2="360" y2="510" stroke="#000" strokeWidth="1.5" />

      {/* 書架外框 */}
      <rect x="30" y="50" width="300" height="465" fill="url(#woodW)" />
      <rect x="42" y="62" width="276" height="441" fill="#0e0805" />
      {/* 層板 */}
      <rect x="42" y="208" width="276" height="6" fill="url(#woodW)" />
      <rect x="42" y="354" width="276" height="6" fill="url(#woodW)" />

      {/* 上層書本 */}
      <Book x="55" y="80" w="28" h="125" color="#2d6a4f" id="green" />
      <Book x="87" y="72" w="32" h="133" color="#9d2c2c" stripe="#ffd166" id="red" />
      <Book x="123" y="86" w="26" h="119" color="#704214" id="brown" />
      <Book x="153" y="76" w="34" h="129" color="#1e3a8a" id="blue" />
      <Book x="191" y="80" w="28" h="125" color="#4a1c40" id="purple" />
      <Book x="223" y="74" w="32" h="131" color="#b8860b" stripe="#fff5cc" id="gold" />
      <Book x="259" y="84" w="26" h="121" color="#3a3a3a" id="black" />
      <Book x="289" y="78" w="24" h="127" color="#6b8e23" id="olive" />

      {/* 中層 - 書與裝飾骷髏 */}
      <Book x="55" y="225" w="30" h="128" color="#5d4e75" id="lavender" />
      <Book x="89" y="220" w="26" h="133" color="#7a3838" id="maroon" />
      {/* 古董骷髏 */}
      <g transform="translate(160, 295)">
        <ellipse cx="0" cy="0" rx="26" ry="30" fill="#e8dcc4" />
        <ellipse cx="0" cy="6" rx="20" ry="22" fill="#d4c4a0" />
        <ellipse cx="-9" cy="-4" rx="5" ry="6" fill="#0a0604" />
        <ellipse cx="9" cy="-4" rx="5" ry="6" fill="#0a0604" />
        <polygon points="-2,8 2,8 0,14" fill="#0a0604" />
        <rect x="-7" y="18" width="2.5" height="8" fill="#0a0604" />
        <rect x="-2" y="18" width="2.5" height="8" fill="#0a0604" />
        <rect x="3" y="18" width="2.5" height="8" fill="#0a0604" />
      </g>
      <Book x="220" y="222" w="28" h="131" color="#0d4f3c" id="forest" />
      <Book x="252" y="226" w="32" h="127" color="#4b0082" id="indigo" />
      <Book x="288" y="220" w="26" h="133" color="#cd5c5c" id="coral" />

      {/* 下層 - 書與沙漏 */}
      <Book x="55" y="370" w="32" h="135" color="#800020" id="wine" />
      <Book x="91" y="365" w="26" h="140" color="#191970" id="navy" />
      {/* 沙漏 */}
      <g transform="translate(160, 437)">
        <rect x="-22" y="-50" width="44" height="5" fill="#5b3a22" />
        <rect x="-22" y="45" width="44" height="5" fill="#5b3a22" />
        <polygon points="-18,-44 18,-44 0,-2" fill="#daa520" opacity="0.18" stroke="#5b3a22" strokeWidth="1" />
        <polygon points="-18,44 18,44 0,2" fill="#daa520" opacity="0.18" stroke="#5b3a22" strokeWidth="1" />
        <polygon points="-15,-42 15,-42 0,-12" fill="#e8b830" opacity="0.85" />
        <polygon points="-10,42 10,42 0,18" fill="#e8b830" opacity="0.85" />
        <line x1="0" y1="-2" x2="0" y2="2" stroke="#e8b830" strokeWidth="1" />
      </g>
      <Book x="220" y="368" w="28" h="137" color="#556b2f" id="moss" />
      <Book x="252" y="372" w="32" h="133" color="#8b008b" id="orchid" />
      <Book x="288" y="366" w="26" h="139" color="#a0522d" id="sienna" />

      <text x="180" y="40" fill="#a08060" fontSize="12" textAnchor="middle" fontStyle="italic">
        書架塵封多年，書本擺得滿滿當當⋯⋯
      </text>
    </svg>
  );
}

/* =====================================================
 *  東面 · 書桌
 * ===================================================== */
function EastScene({ flags, setFlag, selected, setSelected, addItem, removeItem, showToast, setModal }) {
  const handleClock = () => {
    setFlag('timeChecked');
    setModal({
      title: '古董座鐘',
      body: '一座精緻的古董座鐘，指針已停止擺動。\n\n時針指向 9\n分針指向 27 分（5 與 6 之間）\n\n顯示時間：09 : 27',
    });
  };

  const handleDrawer = () => {
    if (!flags.drawerOpen) {
      if (selected === 'smallKey') {
        setFlag('drawerOpen');
        removeItem('smallKey');
        setSelected(null);
        setModal({
          title: '抽屜開啟',
          body: '小鑰匙完美嵌入鎖孔，「喀啦」一聲，抽屜彈開了！\n\n抽屜深處躺著一張泛黃的紙條⋯⋯\n\n（小鑰匙已使用）',
        });
      } else {
        showToast('抽屜上鎖了，需要鑰匙');
      }
    } else if (!flags.paperTaken) {
      addItem('paper');
      setFlag('paperTaken');
      setModal({
        title: '發現新物品',
        body: '你拿出抽屜內的紙條。\n\n📜 泛黃紙條 已加入背包\n（點擊背包中的紙條可閱讀）',
      });
    } else {
      showToast('抽屜已經空了');
    }
  };

  const handleLamp = () => {
    setModal({
      title: '銅製桌燈',
      body: '一盞老舊的銅製桌燈，散發著昏黃的光，照亮了書桌的一角。\n燈罩的花紋已經斑駁。',
    });
  };

  const handleNotebook = () => {
    setModal({
      title: '攤開的筆記',
      body: '一本攤開於桌上的筆記，最後一頁寫著：\n\n「四個數字是時間的密語，\n而真相，藏在畫的後方。」',
    });
  };

  const handleChair = () => {
    showToast('一張舊木椅，看起來搖搖欲墜');
  };

  return (
    <svg viewBox="0 0 360 600" className="scene-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="wallE" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a1e" />
          <stop offset="1" stopColor="#15100a" />
        </linearGradient>
        <linearGradient id="deskE" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#704214" />
          <stop offset="1" stopColor="#3d2410" />
        </linearGradient>
        <radialGradient id="lampGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe7a3" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffe7a3" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="360" height="600" fill="url(#wallE)" />

      {/* 牆壁紋理 */}
      <line x1="0" y1="180" x2="360" y2="180" stroke="#2a1808" strokeWidth="1" opacity="0.5" />
      <line x1="120" y1="0" x2="120" y2="380" stroke="#2a1808" strokeWidth="1" opacity="0.4" />
      <line x1="240" y1="0" x2="240" y2="380" stroke="#2a1808" strokeWidth="1" opacity="0.4" />

      {/* 燈光暈染 */}
      <ellipse cx="280" cy="320" rx="220" ry="200" fill="url(#lampGlow)" />

      {/* 地板 */}
      <rect y="510" width="360" height="90" fill="#0e0805" />
      <line x1="0" y1="510" x2="360" y2="510" stroke="#000" strokeWidth="1.5" />

      {/* 桌面 */}
      <rect x="10" y="380" width="340" height="14" fill="#3d2410" />
      <rect x="10" y="394" width="340" height="116" fill="url(#deskE)" />
      {/* 桌邊裝飾 */}
      <rect x="10" y="392" width="340" height="3" fill="#a07810" opacity="0.3" />

      {/* 桌腳 */}
      <rect x="22" y="394" width="14" height="116" fill="#2a1808" />
      <rect x="324" y="394" width="14" height="116" fill="#2a1808" />

      {/* 抽屜 */}
      <g onClick={handleDrawer} className={`clickable${!flags.drawerOpen && flags.keyFound ? ' glow-hint' : ''}`}>
        <rect x="120" y="410" width="120" height="62" fill={flags.drawerOpen ? '#0a0604' : '#5b3a22'} stroke="#1a0e07" strokeWidth="1.5" />
        {!flags.drawerOpen ? (
          <>
            <circle cx="180" cy="441" r="5" fill="#daa520" />
            <circle cx="180" cy="441" r="2.5" fill="#3d2410" />
            <rect x="174" y="438" width="12" height="6" fill="none" stroke="#3d2410" strokeWidth="0.5" />
          </>
        ) : (
          <>
            <rect x="125" y="415" width="110" height="52" fill="#000" />
            {!flags.paperTaken && (
              <g transform="translate(180,440) rotate(-8)">
                <rect x="-22" y="-10" width="44" height="20" fill="#f5e6c8" stroke="#a08060" strokeWidth="0.5" />
                <line x1="-18" y1="-5" x2="18" y2="-5" stroke="#a08060" strokeWidth="0.4" />
                <line x1="-18" y1="0" x2="18" y2="0" stroke="#a08060" strokeWidth="0.4" />
                <line x1="-18" y1="5" x2="14" y2="5" stroke="#a08060" strokeWidth="0.4" />
              </g>
            )}
          </>
        )}
      </g>

      {/* 古董時鐘 */}
      <g onClick={handleClock} className="clickable" transform="translate(80, 320)">
        <rect x="-34" y="-60" width="68" height="62" fill="#5b3a22" rx="2" />
        <rect x="-30" y="-56" width="60" height="54" fill="#0a0604" rx="2" />
        <circle cx="0" cy="-29" r="22" fill="#f5e6c8" stroke="#3d2410" strokeWidth="2" />
        {/* 時鐘刻度 */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => {
          const a = (h / 12) * 2 * Math.PI - Math.PI / 2;
          const major = h % 3 === 0;
          return (
            <line
              key={h}
              x1={Math.cos(a) * (major ? 16 : 18)}
              y1={-29 + Math.sin(a) * (major ? 16 : 18)}
              x2={Math.cos(a) * 20}
              y2={-29 + Math.sin(a) * 20}
              stroke="#3d2410"
              strokeWidth={major ? 1.5 : 0.8}
            />
          );
        })}
        {/* 時針 → 9 點 */}
        <line x1="0" y1="-29" x2="-11" y2="-29" stroke="#3d2410" strokeWidth="2.8" strokeLinecap="round" />
        {/* 分針 → 27 分（約 162°） */}
        <line x1="0" y1="-29" x2="5" y2="-13" stroke="#3d2410" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="0" cy="-29" r="2" fill="#3d2410" />
        {/* 鐘擺 */}
        <line x1="0" y1="-2" x2="0" y2="-6" stroke="#5b3a22" strokeWidth="1" />
      </g>

      {/* 桌燈 */}
      <g onClick={handleLamp} className="clickable" transform="translate(290, 340)">
        <ellipse cx="0" cy="22" rx="22" ry="6" fill="#3d2410" />
        <ellipse cx="0" cy="20" rx="20" ry="5" fill="#5b3a22" />
        <rect x="-3" y="-32" width="6" height="54" fill="#3d2410" />
        <polygon points="-22,-38 22,-38 17,-66 -17,-66" fill="#5b3a22" stroke="#3d2410" strokeWidth="1" />
        <polygon points="-19,-39 19,-39 14,-64 -14,-64" fill="#daa520" opacity="0.45" />
        {/* 光線 */}
        <polygon points="-22,-38 22,-38 28,-32 -28,-32" fill="#ffe7a3" opacity="0.18" />
      </g>

      {/* 攤開的筆記本 */}
      <g onClick={handleNotebook} className="clickable" transform="translate(180, 366)">
        <rect x="-30" y="0" width="60" height="22" fill="#704214" />
        <rect x="-28" y="2" width="27" height="18" fill="#f5e6c8" />
        <rect x="1" y="2" width="27" height="18" fill="#f5e6c8" />
        <line x1="0" y1="2" x2="0" y2="20" stroke="#3d2410" strokeWidth="0.6" />
        {[6, 9, 12, 15].map((y) => (
          <React.Fragment key={y}>
            <line x1="-25" y1={y} x2="-4" y2={y} stroke="#a08060" strokeWidth="0.4" />
            <line x1="4" y1={y} x2="25" y2={y} stroke="#a08060" strokeWidth="0.4" />
          </React.Fragment>
        ))}
      </g>

      {/* 椅子（裝飾） */}
      <g onClick={handleChair} className="clickable">
        <rect x="155" y="490" width="50" height="20" fill="#3d2410" />
        <rect x="155" y="455" width="50" height="8" fill="#3d2410" />
        <rect x="158" y="463" width="6" height="32" fill="#3d2410" />
        <rect x="196" y="463" width="6" height="32" fill="#3d2410" />
      </g>

      <text x="180" y="40" fill="#a08060" fontSize="12" textAnchor="middle" fontStyle="italic">
        古董書桌上有時鐘、桌燈與筆記⋯⋯
      </text>
    </svg>
  );
}

/* =====================================================
 *  南面 · 油畫 / 保險箱
 * ===================================================== */
function SouthScene({ flags, setFlag, addItem, showToast, setModal }) {
  const [showKeypad, setShowKeypad] = useState(false);

  const handlePainting = () => {
    if (!flags.paintingMoved) {
      setFlag('paintingMoved');
      setModal({
        title: '畫框後的秘密',
        body: '你輕輕推動油畫，畫框竟然向旁滑開——\n\n背後嵌著一個古老的鐵製保險箱！',
      });
    } else {
      showToast('油畫已被推到一旁');
    }
  };

  const handleSafe = () => {
    if (!flags.safeOpen) {
      setShowKeypad(true);
    } else if (!flags.doorKeyTaken) {
      addItem('doorKey');
      setFlag('doorKeyTaken');
      setModal({
        title: '發現新物品',
        body: '保險箱深處靜靜躺著一把沉甸甸的黃銅鑰匙！\n\n🔑 黃銅鑰匙 已加入背包',
      });
    } else {
      showToast('保險箱已被清空');
    }
  };

  const submitCode = () => {
    setShowKeypad(false);
    setFlag('safeOpen');
    setTimeout(() => {
      setModal({
        title: '保險箱開啟',
        body: '密碼正確！\n保險箱發出沉重的「喀啦」聲，鐵門緩緩打開了⋯⋯\n\n裡面似乎放著什麼東西。',
      });
    }, 200);
  };

  return (
    <>
      <svg viewBox="0 0 360 600" className="scene-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="wallS" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a2a1e" />
            <stop offset="1" stopColor="#15100a" />
          </linearGradient>
          <linearGradient id="frameS" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#daa520" />
            <stop offset="0.5" stopColor="#a07810" />
            <stop offset="1" stopColor="#705210" />
          </linearGradient>
          <linearGradient id="skyS" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a2e4e" />
            <stop offset="1" stopColor="#2a4a6e" />
          </linearGradient>
        </defs>
        <rect width="360" height="600" fill="url(#wallS)" />

        {/* 牆面紋理 */}
        <line x1="0" y1="200" x2="360" y2="200" stroke="#2a1808" strokeWidth="1" opacity="0.4" />
        <line x1="180" y1="0" x2="180" y2="510" stroke="#2a1808" strokeWidth="0.8" opacity="0.3" />

        {/* 地板 */}
        <rect y="510" width="360" height="90" fill="#0e0805" />
        <line x1="0" y1="510" x2="360" y2="510" stroke="#000" strokeWidth="1.5" />

        {!flags.paintingMoved ? (
          /* 油畫掛在牆上 */
          <g onClick={handlePainting} className="clickable glow-hint" transform="translate(180, 270)">
            {/* 畫框 */}
            <rect x="-100" y="-130" width="200" height="260" fill="url(#frameS)" />
            <rect x="-92" y="-122" width="184" height="244" fill="#5b3a22" />
            <rect x="-88" y="-118" width="176" height="236" fill="#3d2410" />
            {/* 畫面內容：月夜山景 */}
            <rect x="-86" y="-116" width="172" height="140" fill="url(#skyS)" />
            <circle cx="40" cy="-80" r="22" fill="#ffe7a3" opacity="0.85" />
            <circle cx="40" cy="-80" r="22" fill="#fff5cc" opacity="0.3" />
            {/* 雲 */}
            <ellipse cx="-50" cy="-100" rx="22" ry="6" fill="#fff" opacity="0.15" />
            <ellipse cx="-20" cy="-90" rx="18" ry="4" fill="#fff" opacity="0.15" />
            {/* 山脈 */}
            <polygon points="-86,24 -40,-40 -10,10 30,-30 70,5 86,24" fill="#0d2818" />
            <polygon points="-86,24 -50,-10 -20,18 10,-5 50,15 86,24" fill="#1a3318" />
            {/* 地面 */}
            <rect x="-86" y="20" width="172" height="98" fill="#0a1a10" />
            {/* 星星 */}
            <circle cx="-60" cy="-110" r="0.8" fill="#fff" />
            <circle cx="-30" cy="-105" r="0.6" fill="#fff" />
            <circle cx="10" cy="-110" r="0.7" fill="#fff" />
            <circle cx="70" cy="-100" r="0.5" fill="#fff" />
            {/* 標題 */}
            <text x="0" y="108" fill="#daa520" fontSize="9" textAnchor="middle" fontStyle="italic">— 月夜山景 —</text>
          </g>
        ) : (
          <>
            {/* 油畫被推到左側 */}
            <g transform="translate(60, 250) scale(0.55) rotate(-3)">
              <rect x="-100" y="-130" width="200" height="260" fill="url(#frameS)" />
              <rect x="-92" y="-122" width="184" height="244" fill="#5b3a22" />
              <rect x="-88" y="-118" width="176" height="236" fill="#3d2410" />
              <rect x="-86" y="-116" width="172" height="140" fill="url(#skyS)" />
              <circle cx="40" cy="-80" r="22" fill="#ffe7a3" opacity="0.85" />
              <polygon points="-86,24 -40,-40 -10,10 30,-30 70,5 86,24" fill="#0d2818" />
              <rect x="-86" y="20" width="172" height="98" fill="#0a1a10" />
            </g>

            {/* 牆上的暗格 */}
            <rect x="160" y="155" width="180" height="220" fill="#0a0604" stroke="#1a0e07" strokeWidth="2" />

            {/* 保險箱 */}
            <g
              onClick={handleSafe}
              className={`clickable${(!flags.safeOpen || !flags.doorKeyTaken) ? ' glow-hint' : ''}`}
              transform="translate(250, 265)"
            >
              <rect x="-70" y="-95" width="140" height="190" fill="#2a2a2a" stroke="#0a0604" strokeWidth="3" rx="3" />
              <rect x="-64" y="-89" width="128" height="178" fill="#3a3a3a" rx="2" />
              {/* 鉚釘 */}
              {[[-58, -83], [58, -83], [-58, 83], [58, 83]].map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r="3" fill="#1a1a1a" stroke="#5b5b5b" strokeWidth="0.5" />
              ))}

              {flags.safeOpen ? (
                <>
                  {/* 打開的保險箱內部 */}
                  <rect x="-50" y="-70" width="100" height="140" fill="#000" />
                  <rect x="-50" y="-70" width="100" height="140" fill="none" stroke="#5b3a22" strokeWidth="0.5" />
                  {!flags.doorKeyTaken ? (
                    <>
                      <text x="0" y="20" fontSize="48" textAnchor="middle">🔑</text>
                      <text x="0" y="52" fill="#daa520" fontSize="9" textAnchor="middle" fontStyle="italic">
                        （點擊拾取）
                      </text>
                    </>
                  ) : (
                    <text x="0" y="10" fill="#5b3a22" fontSize="11" textAnchor="middle" fontStyle="italic">
                      已清空
                    </text>
                  )}
                </>
              ) : (
                <>
                  {/* 轉盤 */}
                  <circle cx="22" cy="0" r="22" fill="#1a1a1a" stroke="#daa520" strokeWidth="1.5" />
                  <circle cx="22" cy="0" r="18" fill="#2a2a2a" />
                  {/* 刻度 */}
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                    const a = (i / 8) * 2 * Math.PI;
                    return (
                      <line
                        key={i}
                        x1={22 + Math.cos(a) * 13}
                        y1={Math.sin(a) * 13}
                        x2={22 + Math.cos(a) * 17}
                        y2={Math.sin(a) * 17}
                        stroke="#daa520"
                        strokeWidth="1"
                      />
                    );
                  })}
                  <line x1="22" y1="0" x2="36" y2="-8" stroke="#daa520" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="22" cy="0" r="2" fill="#daa520" />

                  {/* 顯示窗 */}
                  <rect x="-58" y="-22" width="40" height="14" fill="#0a0604" stroke="#daa520" strokeWidth="1" />
                  <text x="-38" y="-12" fontSize="9" fill="#daa520" textAnchor="middle" fontFamily="monospace">— — — —</text>

                  {/* 鎖鈕 */}
                  <rect x="-58" y="20" width="40" height="40" fill="#1a1a1a" stroke="#daa520" strokeWidth="0.8" rx="2" />
                  <text x="-38" y="46" fontSize="22" textAnchor="middle">🔒</text>
                </>
              )}
            </g>
          </>
        )}

        <text x="180" y="40" fill="#a08060" fontSize="12" textAnchor="middle" fontStyle="italic">
          {flags.paintingMoved
            ? (flags.safeOpen ? '保險箱已開啟⋯⋯' : '一座古老的鐵製保險箱')
            : '一幅靜謐的月夜山景油畫'}
        </text>
      </svg>
      {showKeypad && (
        <Keypad
          target="0927"
          hint="提示：時光流轉，凝視時針所指之處⋯⋯"
          onSubmit={submitCode}
          onClose={() => setShowKeypad(false)}
        />
      )}
    </>
  );
}

/* =====================================================
 *  北面 · 大門
 * ===================================================== */
function NorthScene({ flags, setFlag, selected, setSelected, removeItem, setScreen, showToast, setModal }) {
  const handleDoor = () => {
    if (selected === 'doorKey') {
      removeItem('doorKey');
      setSelected(null);
      setFlag('doorOpen');
      setModal({
        title: '逃脫成功！',
        body: '黃銅鑰匙與門鎖完美吻合！\n你扭動鑰匙，門鎖「喀啦」一聲打開⋯⋯\n\n門外是一片晨光，新鮮空氣撲面而來。',
        onConfirm: () => setScreen('win'),
        confirmLabel: '走出大門 →',
      });
    } else {
      showToast('大門緊閉，需要鑰匙才能打開');
    }
  };

  return (
    <svg viewBox="0 0 360 600" className="scene-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="wallN" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a1e" />
          <stop offset="1" stopColor="#15100a" />
        </linearGradient>
        <linearGradient id="doorG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b3a22" />
          <stop offset="0.5" stopColor="#3d2410" />
          <stop offset="1" stopColor="#2a1808" />
        </linearGradient>
        <linearGradient id="doorPanel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3d2410" />
          <stop offset="1" stopColor="#1a0e07" />
        </linearGradient>
      </defs>
      <rect width="360" height="600" fill="url(#wallN)" />

      {/* 牆面紋理 */}
      <line x1="0" y1="180" x2="360" y2="180" stroke="#2a1808" strokeWidth="1" opacity="0.4" />
      <line x1="0" y1="380" x2="360" y2="380" stroke="#2a1808" strokeWidth="1" opacity="0.4" />

      {/* 地板 */}
      <rect y="510" width="360" height="90" fill="#0e0805" />
      <line x1="0" y1="510" x2="360" y2="510" stroke="#000" strokeWidth="1.5" />

      {/* 門框 */}
      <rect x="68" y="64" width="224" height="448" fill="#2a1808" />
      {/* 門 */}
      <g
        onClick={handleDoor}
        className={`clickable${selected === 'doorKey' ? ' glow-hint' : ''}`}
      >
        <rect x="78" y="74" width="204" height="438" fill="url(#doorG)" stroke="#0a0604" strokeWidth="2" />

        {/* 門板花紋 */}
        <rect x="98" y="94" width="164" height="100" fill="url(#doorPanel)" stroke="#704214" strokeWidth="1.5" />
        <rect x="98" y="206" width="164" height="100" fill="url(#doorPanel)" stroke="#704214" strokeWidth="1.5" />
        <rect x="98" y="318" width="164" height="180" fill="url(#doorPanel)" stroke="#704214" strokeWidth="1.5" />

        {/* 門板裝飾 - 內框 */}
        <rect x="106" y="102" width="148" height="84" fill="none" stroke="#5b3a22" strokeWidth="0.6" />
        <rect x="106" y="214" width="148" height="84" fill="none" stroke="#5b3a22" strokeWidth="0.6" />
        <rect x="106" y="326" width="148" height="164" fill="none" stroke="#5b3a22" strokeWidth="0.6" />

        {/* 上層裝飾雕花 */}
        <circle cx="180" cy="144" r="14" fill="none" stroke="#704214" strokeWidth="0.8" />
        <circle cx="180" cy="144" r="6" fill="#5b3a22" />
        <circle cx="180" cy="256" r="14" fill="none" stroke="#704214" strokeWidth="0.8" />
        <circle cx="180" cy="256" r="6" fill="#5b3a22" />

        {/* 鉸鏈 */}
        <rect x="78" y="120" width="10" height="30" fill="#1a1a1a" stroke="#daa520" strokeWidth="0.5" />
        <rect x="78" y="280" width="10" height="30" fill="#1a1a1a" stroke="#daa520" strokeWidth="0.5" />
        <rect x="78" y="440" width="10" height="30" fill="#1a1a1a" stroke="#daa520" strokeWidth="0.5" />

        {/* 把手 */}
        <circle cx="244" cy="368" r="11" fill="#daa520" stroke="#5b3a22" strokeWidth="1.5" />
        <circle cx="244" cy="368" r="5" fill="#a07810" />
        <circle cx="244" cy="368" r="2" fill="#5b3a22" />

        {/* 鎖盤 */}
        <rect x="232" y="392" width="24" height="36" fill="#daa520" stroke="#5b3a22" strokeWidth="1" rx="2" />
        <rect x="240" y="404" width="8" height="10" fill="#0a0604" />
        <rect x="243" y="414" width="2" height="9" fill="#0a0604" />
      </g>

      {/* 門檻 */}
      <rect x="68" y="510" width="224" height="6" fill="#1a0e07" />

      <text x="180" y="40" fill="#a08060" fontSize="12" textAnchor="middle" fontStyle="italic">
        厚重的木製大門，這是唯一的出口⋯⋯
      </text>
    </svg>
  );
}

/* =====================================================
 *  提示系統
 * ===================================================== */
function getHint(flags, inv, selected, dir) {
  if (!flags.keyFound) {
    return '四面之牆都值得探索。或許你該到西面書架仔細翻閱每一本書？';
  }
  if (!flags.drawerOpen) {
    if (dir !== 1) return '你拿到的鑰匙似乎能打開東面書桌的某處。';
    if (selected !== 'smallKey') return '從背包選擇小鑰匙，再點擊抽屜試試？';
    return '對著抽屜使用鑰匙吧。';
  }
  if (!flags.paperTaken) return '抽屜裡好像還有東西沒拿走。';
  if (!flags.timeChecked) return '紙條提到「時針所指」⋯⋯桌上的時鐘指著幾點？';
  if (!flags.paintingMoved) {
    return '南面的油畫似乎不只是裝飾，試著推推看？';
  }
  if (!flags.safeOpen) return '保險箱密碼是 4 位數字，與時鐘上的時間有關。';
  if (!flags.doorKeyTaken) return '保險箱裡還有東西尚未取走。';
  if (dir !== 0) return '帶著鑰匙到北面大門吧！';
  if (selected !== 'doorKey') return '從背包選擇黃銅鑰匙，再點擊大門。';
  return '對著大門使用鑰匙，你就能逃出去了！';
}

/* =====================================================
 *  主元件
 * ===================================================== */
function App() {
  const [screen, setScreen] = useState('title'); // title | game | win
  const [dir, setDir] = useState(0);
  const [inv, setInv] = useState([]);
  const [selected, setSelected] = useState(null);
  const [flags, setFlagsState] = useState({
    keyFound: false,
    redBookRead: false,
    drawerOpen: false,
    paperTaken: false,
    timeChecked: false,
    paintingMoved: false,
    safeOpen: false,
    doorKeyTaken: false,
    doorOpen: false,
  });
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = (msg) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(''), 2400);
  };

  const setFlag = (key, val = true) => {
    setFlagsState((p) => ({ ...p, [key]: val }));
  };

  const addItem = (id) => {
    setInv((p) => (p.includes(id) ? p : [...p, id]));
  };
  const removeItem = (id) => {
    setInv((p) => p.filter((x) => x !== id));
  };

  const rotate = (delta) => {
    setDir((p) => (p + delta + 4) % 4);
    setSelected(null);
  };

  /* ========== 開場畫面 ========== */
  if (screen === 'title') {
    return (
      <div className="full-screen">
        <div className="content">
          <div className="deco">🕯️</div>
          <h1>密室逃脫</h1>
          <h2>古書房之謎</h2>
          <p>
            你在一間古老的書房中醒來，<br />
            沉重的木門緊閉，<br />
            四面皆是高牆。<br /><br />
            探索四周、收集線索，<br />
            找出逃離此處的方法⋯⋯
          </p>
          <button className="primary-btn" onClick={() => setScreen('game')}>
            開始遊戲
          </button>
          <p className="tip">提示：點擊左右按鈕轉換視角 · 點擊場景物件互動</p>
        </div>
      </div>
    );
  }

  /* ========== 結尾畫面 ========== */
  if (screen === 'win') {
    return (
      <div className="full-screen">
        <div className="content">
          <div className="deco">🌅</div>
          <h1>逃脫成功</h1>
          <h2>YOU ARE FREE</h2>
          <p>
            大門在你身後緩緩闔上，<br />
            晨光灑在臉上，<br />
            鳥鳴從遠處傳來⋯⋯<br /><br />
            你終於重獲自由。
          </p>
          <button className="primary-btn" onClick={() => window.location.reload()}>
            再玩一次
          </button>
          <p className="tip">恭喜通關 · 感謝遊玩</p>
        </div>
      </div>
    );
  }

  /* ========== 遊戲畫面 ========== */
  const sceneProps = {
    flags, setFlag, selected, setSelected,
    addItem, removeItem, showToast, setModal,
  };

  return (
    <div className="game-screen">
      <div className="game-header">
        <div style={{ width: 30 }} />
        <div className="dir-label">{DIRECTIONS[dir]}</div>
        <button
          className="help-btn"
          onClick={() =>
            setModal({
              title: '線索提示',
              body: getHint(flags, inv, selected, dir),
            })
          }
        >
          ?
        </button>
      </div>

      <div className="scene-container">
        {dir === 0 && <NorthScene {...sceneProps} setScreen={setScreen} />}
        {dir === 1 && <EastScene {...sceneProps} />}
        {dir === 2 && <SouthScene {...sceneProps} />}
        {dir === 3 && <WestScene {...sceneProps} />}
      </div>

      <div className="nav-bar">
        <button className="nav-btn" onClick={() => rotate(-1)}>← 向左</button>
        <div className="compass">{COMPASS[dir]}</div>
        <button className="nav-btn" onClick={() => rotate(1)}>向右 →</button>
      </div>

      <div className="inventory">
        <div className="inv-label">
          <span>背包</span>
          <span className="inv-hint">
            {selected ? `已選擇：${ITEM_DATA[selected].name}（再點擊查看）` : '點擊物品選擇 · 對場景使用'}
          </span>
        </div>
        <div className="inv-items">
          {inv.length === 0 ? (
            <div className="inv-empty">尚未拾取任何物品⋯⋯</div>
          ) : (
            inv.map((id) => (
              <button
                key={id}
                className={`inv-item${selected === id ? ' selected' : ''}`}
                onClick={() => {
                  if (selected === id) {
                    setModal({ title: ITEM_DATA[id].name, body: ITEM_DATA[id].desc });
                  } else {
                    setSelected(id);
                    showToast(`已選擇：${ITEM_DATA[id].name}`);
                  }
                }}
              >
                <span className="inv-icon">{ITEM_DATA[id].icon}</span>
                <span className="inv-name">{ITEM_DATA[id].name}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {modal && (
        <Modal
          title={modal.title}
          body={modal.body}
          onConfirm={modal.onConfirm}
          confirmLabel={modal.confirmLabel}
          onClose={() => setModal(null)}
        />
      )}
      {toast && <div className="toast" key={toast}>{toast}</div>}
    </div>
  );
}
