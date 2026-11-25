import React,{useEffect}from'react';
import{BrowserRouter,Routes,Route,Navigate,useLocation,Link}from'react-router-dom';
import{ThemeProvider}from'./context/ThemeContext';
import{DesignReviewIdentity}from'./context/AuthContext';
import{brand}from'./brand';
import Home from'./pages/Home';
import Login from'./pages/Login';
import Terms from'./pages/Terms';
import DesignPreview from'./pages/DesignPreview';
function ReviewScreens(){const{pathname}=useLocation();return <>{pathname!=='/design-preview'&&<div className="lm-review-banner"><span>Read-only design review</span><span>Sample screens only. Sign-in and sending are disabled.</span><Link to="/design-preview">Open dashboard preview</Link></div>}<Routes><Route path="/" element={<Home/>}/><Route path="/login" element={<Login designReview/>}/><Route path="/terms" element={<Terms/>}/><Route path="/design-preview" element={<DesignPreview/>}/><Route path="*" element={<Navigate to="/design-preview" replace/>}/></Routes></>;}
export default function DesignReviewApp(){useEffect(()=>{document.title=brand.name+' · Design review';const icon=document.createElement('link');icon.rel='icon';icon.href=brand.logo;document.head.appendChild(icon);return()=>icon.remove();},[]);return <ThemeProvider><DesignReviewIdentity><BrowserRouter><ReviewScreens/></BrowserRouter></DesignReviewIdentity></ThemeProvider>;}
