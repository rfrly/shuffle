import { useState } from 'react';
import * as ReactDOM from 'react-dom';
import { EX_MIN, EX_MAX, EX_MAX_LETTERS } from '../constants.js';

export function fmt(n) { return n < 10 ? `0${n}` : `${n}`; }
export function numToLetter(n) { return String.fromCharCode(64 + n); }
export function fmtEx(n, lm) { return lm ? numToLetter(n) : fmt(n); }

function NumpadGrid({ onDigit, onBackspace, onClear }) {
  return (
    <div className="numpad-grid">
      {[7,8,9,4,5,6,1,2,3].map(d => (
        <button key={d} className="numpad-key" onPointerDown={(e) => { e.preventDefault(); onDigit(String(d)); }}>{d}</button>
      ))}
      <button className="numpad-key fn" onPointerDown={(e) => { e.preventDefault(); onClear(); }}>✕</button>
      <button className="numpad-key" onPointerDown={(e) => { e.preventDefault(); onDigit('0'); }}>0</button>
      <button className="numpad-key fn" onPointerDown={(e) => { e.preventDefault(); onBackspace(); }}>⌫</button>
    </div>
  );
}

function LetterpadGrid({ onLetter, onBackspace, onClear }) {
  return (
    <div className="letterpad-grid">
      {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => (
        <button key={l} className="numpad-key letter-key" onPointerDown={(e) => { e.preventDefault(); onLetter(l); }}>{l}</button>
      ))}
      <button className="numpad-key fn" onPointerDown={(e) => { e.preventDefault(); onClear(); }}>✕</button>
      <button className="numpad-key fn" onPointerDown={(e) => { e.preventDefault(); onBackspace(); }}>⌫</button>
    </div>
  );
}

export function NumpadPopup({ label, initialValue, onConfirm, onClose, letterMode }) {
  const [inputStr, setInputStr] = useState('');
  const handleDigit = (d) => setInputStr(s => s.length < 3 ? s + d : s);
  const handleLetter = (l) => setInputStr(l);
  const handleBackspace = () => setInputStr(s => s.slice(0, -1));
  const handleClear = () => setInputStr('');
  const handleOk = () => {
    if (letterMode) {
      const raw = isEmpty ? numToLetter(initialValue) : inputStr;
      const v = raw.toUpperCase().charCodeAt(0) - 64;
      const c = isNaN(v) || v < 1 ? 1 : Math.min(v, EX_MAX_LETTERS);
      onConfirm(c);
    } else {
      const raw = isEmpty ? String(initialValue) : inputStr;
      const v = parseInt(raw);
      const c = isNaN(v) || v < EX_MIN ? EX_MIN : Math.min(v, EX_MAX);
      onConfirm(c);
    }
  };
  const isEmpty = inputStr === '';
  const placeholder = letterMode ? numToLetter(initialValue) : String(initialValue);
  return ReactDOM.createPortal(
    <>
      <div className="numpad-backdrop" onClick={onClose} />
      <div className="numpad-popup">
        <div className="numpad-header">{label}</div>
        <div className={`numpad-display${isEmpty ? ' placeholder' : ''}`}>{isEmpty ? placeholder : inputStr}</div>
        {letterMode
          ? <LetterpadGrid onLetter={handleLetter} onBackspace={handleBackspace} onClear={handleClear} />
          : <NumpadGrid onDigit={handleDigit} onBackspace={handleBackspace} onClear={handleClear} />}
        <div className="numpad-actions">
          <button className="numpad-cancel" onPointerDown={(e) => e.preventDefault()} onClick={onClose}>Cancel</button>
          <button className="numpad-ok" onPointerDown={(e) => e.preventDefault()} onClick={handleOk}>OK</button>
        </div>
      </div>
    </>,
    document.body
  );
}

export function BarPickerPopup({ pickedNums, onConfirm, onClose, letterMode }) {
  const [localPicked, setLocalPicked] = useState(() => [...pickedNums]);
  const [inputStr, setInputStr] = useState('');
  const [flashChip, setFlashChip] = useState(null);
  const handleDigit = (d) => setInputStr(s => s.length < 3 ? s + d : s);
  const handleLetter = (l) => setInputStr(l);
  const handleBackspace = () => {
    if (inputStr !== '') setInputStr(s => s.slice(0, -1));
    else setLocalPicked(prev => prev.slice(0, -1));
  };
  const handleClear = () => { if (inputStr !== '') setInputStr(''); else setLocalPicked([]); };
  const handleAdd = () => {
    let c;
    if (letterMode) {
      if (!/^[A-Za-z]$/.test(inputStr)) return;
      c = inputStr.toUpperCase().charCodeAt(0) - 64;
    } else {
      const v = parseInt(inputStr);
      if (isNaN(v)) return;
      c = Math.max(EX_MIN, Math.min(EX_MAX, v));
    }
    if (localPicked.includes(c)) {
      setFlashChip(c);
      setTimeout(() => setFlashChip(null), 400);
      setInputStr('');
      return;
    }
    setLocalPicked(prev => [...prev, c].sort((a, b) => a - b));
    setInputStr('');
  };
  const handleRemove = (n) => setLocalPicked(prev => prev.filter(x => x !== n));
  const handleDone = () => onConfirm([...localPicked]);
  const isEmpty = inputStr === '';
  const parsedValid = letterMode ? (!isEmpty && /^[A-Za-z]$/.test(inputStr)) : (!isEmpty && !isNaN(parseInt(inputStr)));
  return ReactDOM.createPortal(
    <>
      <div className="numpad-backdrop" onClick={onClose} />
      <div className="picker-popup">
        <div className="numpad-header">Pick exercises</div>
        <div className="picker-chips">
          {localPicked.length === 0
            ? <span className="picker-chips-empty">No exercises selected</span>
            : localPicked.map(n => (
                <button key={n} className="picker-chip"
                  style={flashChip === n ? { borderColor: '#ff4500', color: '#ff4500' } : {}}
                  onPointerDown={(e) => { e.preventDefault(); handleRemove(n); }}>
                  {letterMode ? numToLetter(n) : String(n)}
                </button>
              ))
          }
        </div>
        <div className="picker-divider" />
        <div className={`numpad-display${isEmpty ? ' empty' : ''}`}>{isEmpty ? '–' : inputStr}</div>
        {letterMode
          ? <LetterpadGrid onLetter={handleLetter} onBackspace={handleBackspace} onClear={handleClear} />
          : <NumpadGrid onDigit={handleDigit} onBackspace={handleBackspace} onClear={handleClear} />}
        <button className="picker-add-btn" onPointerDown={(e) => e.preventDefault()} onClick={handleAdd} disabled={!parsedValid}>Add</button>
        <button className="picker-done-btn" onPointerDown={(e) => e.preventDefault()} onClick={handleDone}>Done</button>
      </div>
    </>,
    document.body
  );
}
