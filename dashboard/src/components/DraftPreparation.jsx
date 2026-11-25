import React,{useState}from'react';
import RequestStrategy from'./RequestStrategy';
import SharedDrafts from'./SharedDrafts';
export default function DraftPreparation({campaignId,readiness,onSaved}){
 const[mode,setMode]=useState(readiness?.mode==='template'?'shared':'personal');
 return <div className="draft-preparation"><div className="draft-mode" role="group" aria-label="How to prepare messages"><button type="button" aria-pressed={mode==='shared'} onClick={()=>setMode('shared')}><strong>Shared message for a group</strong><span>Reuse your email wording for up to 10 similar businesses.</span></button><button type="button" aria-pressed={mode==='personal'} onClick={()=>setMode('personal')}><strong>One business at a time</strong><span>Use the campaign’s current strategy for one business.</span></button></div><div hidden={mode!=='shared'}><SharedDrafts campaignId={campaignId} onSaved={onSaved}/></div><div hidden={mode!=='personal'}><RequestStrategy campaignId={campaignId} readiness={readiness}/></div></div>;
}
