import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import cities from '../data/search-cities.json';
import './LocationPicker.css';
export const cityLabel=row=>`${row[1]}, ${row[2]}, ${row[3]==='PK'?'Pakistan':'United States'}`;
const normal=v=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function distance(a,b){
 if(Math.abs(a.length-b.length)>2)return 3;
 let previous=Array.from({length:b.length+1},(_,i)=>i),before;
 for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++){next[j]=Math.min(next[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));if(before&&i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])next[j]=Math.min(next[j],before[j-2]+1);}before=previous;previous=next;}
 return previous[b.length];
}
export function suggestCities(value,country){
 const query=normal(value.split(',')[0]),pool=cities.filter(r=>r[3]===country);if(query.length<2)return pool.slice(0,8);
 const prefix=pool.filter(r=>normal(r[1]).startsWith(query));
 if(prefix.length)return prefix.slice(0,6);
 const contains=pool.filter(r=>normal(r[1]).includes(query));if(contains.length)return contains.slice(0,6);
 if(query.length<4||query.length>50)return [];
 return pool.map(row=>({row,score:distance(query,normal(row[1]))})).filter(r=>r.score<=(query.length<6?1:2)).sort((a,b)=>a.score-b.score).slice(0,6).map(r=>r.row);
}
export default function LocationPicker({value,country,confirmed,onChange,onSelect,onConfirmCustom,disabled}){
 const[open,setOpen]=useState(false),[active,setActive]=useState(-1),[browse,setBrowse]=useState(false),input=useRef(null),options=useMemo(()=>suggestCities(browse?'':value,country),[value,country,browse]);
 const expanded=open&&options.length>0;
 useEffect(()=>{if(expanded&&active>=0)document.getElementById(`search-city-${options[active]?.[0]}`)?.scrollIntoView?.({block:'nearest'});},[expanded,active,options]);
 function select(row){onSelect(cityLabel(row));setOpen(false);setActive(-1);}
 return <div className="location-picker"><label htmlFor="search-location">City or area</label><div className="location-combobox"><input ref={input} id="search-location" required maxLength={120} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={expanded} aria-controls="search-city-options" aria-activedescendant={expanded&&active>=0?`search-city-${options[active]?.[0]}`:undefined} aria-describedby="search-location-help" placeholder="Choose or search for a city" value={value} disabled={disabled} onChange={e=>{onChange(e.target.value);setBrowse(false);setOpen(true);setActive(-1);}} onFocus={()=>{setBrowse(confirmed==='city');setOpen(true);setActive(-1);}} onBlur={()=>setOpen(false)} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);return;}if(!options.length)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>e.key==='ArrowDown'?(i+1)%options.length:(i<=0?options.length-1:i-1));}if(e.key==='Enter'&&expanded&&active>=0){e.preventDefault();select(options[active]);}}}/><button className="location-toggle" type="button" disabled={disabled} aria-label={`Show cities in ${country==='PK'?'Pakistan':'the United States'}`} aria-expanded={expanded} aria-controls="search-city-options" onMouseDown={e=>e.preventDefault()} onClick={()=>{const next=!expanded;input.current?.focus();setBrowse(true);setOpen(next);setActive(-1);}}><ChevronDown size={18} aria-hidden="true"/></button><ul id="search-city-options" role="listbox" aria-label="Suggested cities" hidden={!expanded}>{options.map((row,i)=><li id={`search-city-${row[0]}`} key={row[0]} role="option" aria-selected={active===i} onMouseDown={e=>e.preventDefault()} onClick={()=>select(row)}>{cityLabel(row)}</li>)}</ul></div><p id="search-location-help" className="ns-help">Open the list or type to find a city in your selected country.</p>{confirmed==='city'&&<p className="location-confirmed" role="status">City selected. You can review the search.</p>}{value.trim()&&confirmed!=='city'&&<label className="ns-check location-custom"><input type="checkbox" checked={confirmed==='custom'} disabled={disabled} onChange={e=>{onConfirmCustom(e.target.checked);setOpen(false);}}/>My area is not listed. I checked its spelling and country; use this exact area.</label>}<small className="location-credit">City data: <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a>. Unlisted areas are not verified.</small></div>;
}
