import {readErrorMessage} from '../requestError';
import { useEffect, useRef, useState } from 'react';
export default function useReadList(fetchPage, interval = 0) {
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const refresh=useRef(()=>{});
  useEffect(()=>{
    let stopped=false,busy=false,timer;
    setData(null);setError('');
    async function read(){
      if(stopped||busy)return;
      busy=true;setLoading(true);
      try{const result=await fetchPage();if(!stopped){setData(result);setError('');}}
      catch(e){if(!stopped){const denied=[401,403].includes(e.response?.status);if(denied||e.response?.status===404)setData(null);setError(readErrorMessage(e));}}
      finally{busy=false;if(!stopped)setLoading(false);}
    }
    function schedule(){if(interval)timer=setTimeout(async()=>{if(document.visibilityState!=='hidden')await read();if(!stopped)schedule();},interval);}
    refresh.current=read;read();schedule();
    return()=>{stopped=true;clearTimeout(timer);};
  },[fetchPage,interval]);
  return{data,loading,error,refresh:()=>refresh.current()};
}
