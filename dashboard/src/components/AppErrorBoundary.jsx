import React from 'react';
import './PublicPages.css';
export default class AppErrorBoundary extends React.Component{
 state={failed:false};
 static getDerivedStateFromError(){return{failed:true};}
 render(){if(this.state.failed)return <div className="dp-app public-page"><main className="public-error" role="alert"><p className="public-error-code">Page unavailable</p><h1>This page couldn’t load.</h1><p>Reload to try again. If you were saving or sending something, check its status before submitting it again.</p><div className="public-error-actions"><button className="ns-primary" onClick={()=>window.location.reload()}>Reload page</button><a href="/">Back to home</a><a href="/contact">Get help</a></div></main></div>;return this.props.children;}
}
