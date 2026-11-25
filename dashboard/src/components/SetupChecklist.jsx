import React,{useCallback}from'react';
import{getSettings,getCampaigns}from'../api/client';
import useReadList from'../hooks/useReadList';
import SetupChecklistView from'./SetupChecklistView';
export{default as SetupChecklistView}from'./SetupChecklistView';
export default function SetupChecklist({counts}){const fetchSetup=useCallback(async()=>{const[settings,campaigns]=await Promise.all([getSettings(),getCampaigns({page:1,limit:1})]);return{settings,campaign:campaigns.campaigns?.[0]||null};},[]),state=useReadList(fetchSetup);return <SetupChecklistView counts={counts} settings={state.data?.settings} campaign={state.data?.campaign} loading={state.loading} error={state.error} refresh={state.refresh}/>;}
