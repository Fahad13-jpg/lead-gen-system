import React,{createContext,useContext,useEffect,useRef,useState}from'react';
const key='lead-workspace-theme';
const storedTheme=()=>{try{const value=localStorage.getItem(key);return ['light','dark'].includes(value)?value:null;}catch{return null;}};
const systemTheme=()=>window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light';
const ThemeContext=createContext({theme:'light',toggleTheme:()=>{}});
export function ThemeProvider({children}){
 const[theme,setTheme]=useState(()=>storedTheme()||systemTheme()),manual=useRef(Boolean(storedTheme()));
 useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;},[theme]);
 useEffect(()=>{const media=window.matchMedia?.('(prefers-color-scheme: dark)');const follow=()=>{if(!manual.current)setTheme(systemTheme());};const sync=e=>{if(e.key!==key)return;const saved=storedTheme();manual.current=Boolean(saved);setTheme(saved||systemTheme());};media?.addEventListener?.('change',follow);window.addEventListener('storage',sync);return()=>{media?.removeEventListener?.('change',follow);window.removeEventListener('storage',sync);};},[]);
 function toggleTheme(){manual.current=true;setTheme(current=>{const next=current==='dark'?'light':'dark';try{localStorage.setItem(key,next);}catch{/* Theme switching also works without browser storage. */}return next;});}
 return <ThemeContext.Provider value={{theme,toggleTheme}}>{children}</ThemeContext.Provider>;
}
export const useTheme=()=>useContext(ThemeContext);
