import {useCallback,useEffect,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {getWorkspacePackage} from '../api/client';
export default function useWorkspacePackage(){
 const organization=useAuth()?.organization,org=organization?.org_id,hint=organization?.package;
 const [state,setState]=useState({org,data:hint||null,loading:true,error:false,checkedAt:null});
 const [revision,setRevision]=useState(0),refresh=useCallback(()=>setRevision(n=>n+1),[]);
 useEffect(()=>{let stopped=false;
  setState(s=>({org,data:s.org===org?s.data:hint||null,loading:true,error:false}));
  async function read(){try{const data=await getWorkspacePackage();if(!data||!['free','plus'].includes(data.name)||!data.features)throw Error('INVALID_PACKAGE');if(!stopped)setState({org,data,loading:false,error:false,checkedAt:Date.now()});}catch{if(!stopped)setState({org,data:null,loading:false,error:true,checkedAt:null});}}
  if(org)read();else setState({org,data:null,loading:false,error:true,checkedAt:null});
  const timer=setInterval(()=>{if(document.visibilityState==='visible'&&org)read();},30000);
  return()=>{stopped=true;clearInterval(timer);};
 },[org,revision,hint]); // Organization session metadata is a display hint; the endpoint rechecks access.
 return {...(state.org===org?state:{data:null,loading:true,error:false,checkedAt:null}),manuallyChecked:revision>0,refresh};
}
