import { useState, useRef, useEffect } from 'react';
import * as ReactDOM from 'react-dom';

export function CompactSelector({ id, value, options, onChange, disabled, openSelector, setOpenSelector, getLabel, buttonLabel, footer }) {
  const btnRef = useRef(null);
  const isOpen = openSelector === id;
  const [popupStyle, setPopupStyle] = useState({});

  useEffect(() => {
    if (isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPopupStyle({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 6,
        minWidth: rect.width,
      });
    }
  }, [isOpen]);

  const displayLabel = buttonLabel !== undefined ? buttonLabel : (getLabel ? getLabel(value) : String(value));

  const open = () => { if (!disabled) setOpenSelector(isOpen ? null : id); };
  const select = (opt) => { onChange(opt); setOpenSelector(null); };

  return (
    <>
      <button ref={btnRef} className={`compact-sel-btn${isOpen ? " open" : ""}`} onClick={open} disabled={disabled}>
        {displayLabel}
      </button>
      {isOpen && ReactDOM.createPortal(
        <>
          <div className="compact-popup-backdrop" onClick={() => setOpenSelector(null)} />
          <div className="compact-popup" style={popupStyle}>
            {options.map((opt, i) => {
              const optLabel = getLabel ? getLabel(opt) : String(opt);
              const isActive = getLabel ? getLabel(opt) === getLabel(value) : opt === value;
              return (
                <button key={i} className={`sel-btn${isActive ? " active" : ""}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => select(opt)}>
                  {optLabel}
                </button>
              );
            })}
            {footer && (
              <>
                <div style={{ width: '100%', height: 1, background: '#333', margin: '0.2rem 0' }} />
                {footer}
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );
}
