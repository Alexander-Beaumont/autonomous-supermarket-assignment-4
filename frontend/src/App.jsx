import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api.js';
import Layout from './components/Layout.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import ModelPage from './pages/ModelPage.jsx';
import CommercialReportPage from './pages/CommercialReportPage.jsx';
import DailyReportPage from './pages/DailyReportPage.jsx';
import StoreBrainPage from './pages/StoreBrainPage.jsx';
import AssurancePage from './pages/AssurancePage.jsx';
import AuditExplorerPage from './pages/AuditExplorerPage.jsx';
import NewSimulationPage from './pages/NewSimulationPage.jsx';
import { ErrorState, LoadingState } from './components/UI.jsx';

export default function App(){
  const [runs,setRuns]=useState([]);
  const [selectedRunId,setSelectedRunId]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);

  const refreshRuns=useCallback(async()=>{
    const data=await api.runs();
    setRuns(data);
    setSelectedRunId(current=>{
      if(current && data.some(r=>r.id===current&&r.status==='COMPLETED')) return current;
      const submitted=data.find(r=>r.is_submitted&&r.status==='COMPLETED');
      return submitted?.id ?? data.find(r=>r.status==='COMPLETED')?.id ?? null;
    });
    return data;
  },[]);

  useEffect(()=>{
    refreshRuns().catch(setError).finally(()=>setLoading(false));
  },[refreshRuns]);

  if(loading) return <div className="boot-screen"><LoadingState label="Opening the stored supermarket run…"/></div>;
  if(error) return <div className="boot-screen"><ErrorState error={error}/></div>;

  return <Routes>
    <Route element={<Layout runs={runs} selectedRunId={selectedRunId} setSelectedRunId={setSelectedRunId} refreshRuns={refreshRuns}/>}>
      <Route index element={<Navigate to="/overview" replace/>}/>
      <Route path="/overview" element={<OverviewPage/>}/>
      <Route path="/model" element={<ModelPage/>}/>
      <Route path="/report" element={<CommercialReportPage/>}/>
      <Route path="/daily" element={<DailyReportPage/>}/>
      <Route path="/brain" element={<StoreBrainPage/>}/>
      <Route path="/assurance" element={<AssurancePage/>}/>
      <Route path="/audit" element={<AuditExplorerPage/>}/>
      <Route path="/new-run" element={<NewSimulationPage/>}/>
      <Route path="*" element={<Navigate to="/overview" replace/>}/>
    </Route>
  </Routes>;
}
