import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App';
import './styles.css';

class ErrorBoundary extends React.Component{
  constructor(p){super(p);this.state={error:null}}
  static getDerivedStateFromError(error){return{error}}
  componentDidCatch(e,i){console.error(e,i)}
  render(){
    if(this.state.error){
      return <div className="fatal"><h1>Model Generator</h1><p>A apărut o eroare în interfață.</p><pre>{String(this.state.error.stack||this.state.error.message||this.state.error)}</pre></div>
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter><App/></BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
