import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1e3a8a',
            color:       '#fff',
            fontFamily:  'Hind Siliguri, sans-serif',
            fontSize:    '14px',
            borderRadius: '10px'
          },
          success: {
            style: { background: '#065f46' }
          },
          error: {
            style: { background: '#991b1b' }
          }
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
)
