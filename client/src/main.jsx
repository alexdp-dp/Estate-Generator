import React,{Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Route,Routes} from 'react-router-dom';
import AdminApp from './components/AdminApp';
import EmbedApp from './components/EmbedApp';
import './styles.css';

class ErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state={error:null};
  }
  static getDerivedStateFromError(error){
    return {error};
  }
  componentDidCatch(error,info){
    console.error('Estate Studio runtime error:',error,info);
  }
  render(){
    if(this.state.error){
      return (
        <div style={{
          minHeight:'100vh',
          padding:'40px',
          background:'#101512',
          color:'#fff',
          fontFamily:'system-ui,sans-serif'
        }}>
          <h1>Estate Studio nu a putut porni</h1>
          <p style={{color:'#b9c4be'}}>Frontend runtime error:</p>
          <pre style={{
            whiteSpace:'pre-wrap',
            background:'#171e1a',
            padding:'16px',
            borderRadius:'12px'
          }}>
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function App(){
  return (
    <Routes>
      <Route path="/embed/:slug" element={<EmbedApp/>}/>
      <Route path="*" element={<AdminApp/>}/>
    </Routes>
  );
}

const root=document.getElementById('root');
if(!root){
  throw new Error('Elementul #root lipsește din index.html');
}

createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<div className="page-loading">ESTATE STUDIO</div>}>
        <BrowserRouter>
          <App/>
        </BrowserRouter>
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);
