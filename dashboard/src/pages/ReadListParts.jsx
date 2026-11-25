import React from 'react';
export function ReadFeedback({loading,error,data,refresh}){
  return <>{error&&<div className="ws-auth-error" role="alert">{error} <button className="dp-text-button" onClick={refresh}>Try again</button></div>}{loading&&!data&&<p role="status" className="live-loading">Loading records…</p>}{data&&<p className="live-updated">Last refreshed {new Date(data.observed_at).toLocaleTimeString()} {error?'· Update failed; showing an earlier snapshot.':''}</p>}</>;
}
export function Pagination({data,page,setPage,loading}){
  if(!data)return null;
  return <div className="live-pagination"><span>{data.total.toLocaleString()} matching records · Page {page} of {Math.max(1,Math.ceil(data.total/data.limit))}</span><div><button disabled={loading||page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><button disabled={loading||page*data.limit>=data.total} onClick={()=>setPage(p=>p+1)}>Next</button></div></div>;
}
