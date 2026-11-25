import React from'react';
import{Moon,Sun}from'lucide-react';
import{useTheme}from'../context/ThemeContext';
export default function ThemeToggle(){const{theme,toggleTheme}=useTheme(),dark=theme==='dark';return <button className="lm-theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${dark?'light':'dark'} mode`} title={`Switch to ${dark?'light':'dark'} mode`}>{dark?<Sun size={18}/>:<Moon size={18}/>}<span>{dark?'Light mode':'Dark mode'}</span></button>;}
