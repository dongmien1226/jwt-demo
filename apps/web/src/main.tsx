import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {AuthProvider,CartProvider} from './features/context.js';
import App from './App.js';
import './styles/global.css';
import './styles/shop.css';
createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider><CartProvider><App/></CartProvider></AuthProvider></BrowserRouter>);
