import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerOfflineApp } from './offline';
import { applyA11y } from './a11y';
import './style.css';
import './site.css';
import './texture.css';
import './type.css';
import './friendly.css';
import './a11y.css';

applyA11y(); // bigger text, contrast, etc. before the first paint

registerOfflineApp();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);