import { useState, useRef, useEffect } from 'react';
import * as ReactDOM from 'react-dom';

export function CompactSelector({ id, value, options, onChange, disabled, openSelector, setOpenSelector, getLabel, renderOption, buttonLabel, popupClassName, footer }) {
  const btnRef = useRef(null);
  const popupRef = useRef(null);
  const isOpen = openSelector === id;
  const [popupStyle, setPopupStyle] = useState({});

  useEffect(() => {
    if (!isOpen || !btnRef.current) return;
    const position = () => {
      const rect = btnRef.current.getBoundingClientRect();
      const popupWidth = popupRef.current ? popupRef.current.offsetWidth : rect.width;
      const centre = rect.left + rect.width / 2;
      const left = Math.max(8, Math.min(window.innerWidth - 8 - popupWidth, centre - popupWidth / 2));
      const style = {
        left,
        bottom: window.innerHeight - rect.top + 6,
      };
      if (!popupClassName || !popupClassName.includes('timesig-popup')) {
        style.minWidth = rect.width;
      }
      setPopupStyle(style);
    };
    position();
    requestAnimationFrame(position);
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
          <div ref={popupRef} className={`compact-popup${popupClassName ? ` ${popupClassName}` : ""}`} style={popupStyle}>
            {options.map((opt, i) => {
              const optLabel = getLabel ? getLabel(opt) : String(opt);
              const isActive = getLabel ? getLabel(opt) === getLabel(value) : opt === value;
              return (
                <button key={i} className={`sel-btn${isActive ? " active" : ""}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => select(opt)}>
                  {renderOption ? renderOption(opt) : optLabel}
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
