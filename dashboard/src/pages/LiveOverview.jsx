import React,{useCallback,useState}from'react';
import{getOverview}from'../api/client';
import useReadList from'../hooks/useReadList';
import OverviewContent from'./OverviewContent';
import SetupChecklist from'../components/SetupChecklist';
export default function LiveOverview(){
 const[days,setDays]=useState(30);
 const fetchPage=useCallback(()=>getOverview(days),[days]);
 const state=useReadList(fetchPage,60000);
 return <OverviewContent state={state} setup={state.data?<SetupChecklist counts={state.data.counts}/>:null} days={days} setDays={setDays}/>;
}
