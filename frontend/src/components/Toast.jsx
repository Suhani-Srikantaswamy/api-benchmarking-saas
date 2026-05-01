import React, { useEffect, useState } from 'react';
import './Toast.css';

export default function Toast({ msg, type = 'info', onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  return (
    <div className={`toast toast-${type} ${visible ? 'toast-in' : 'toast-out'}`}>
      <span className="toast-msg">{msg}</span>
      <button className="toast-close" onClick={handleClose}>✕</button>
    </div>
  );
}
