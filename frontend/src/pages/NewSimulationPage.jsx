import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { CheckCircle2, Clock3, LockKeyhole, Play, RefreshCw } from 'lucide-react';
import { api } from '../api.js';
import { money } from '../format.js';
import { ErrorState, InfoBanner, PageHeader, SectionCard, StatusPill } from '../components/UI.jsx';

export default function NewSimulationPage() {
  const { refreshRuns, setSelectedRunId } = useOutletContext();
  const navigate=useNavigate();
  const [seed,setSeed]=useState(()=>Math.floor(Math.random()*1_900_000_000)+1);
  const [run,setRun]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(null);
  const [elapsed,setElapsed]=useState(null);

  async function initialise(){
    setBusy(true);setError(null);setElapsed(null);
    try{const created=await api.initializeRun(Number(seed));setRun(created);await refreshRuns();}
    catch(e){setError(e)}finally{setBusy(false)}
  }
  async function execute(){
    if(!run)return; setBusy(true);setError(null); const start=performance.now();
    try{const completed=await api.runSimulation(run.id);setElapsed((performance.now()-start)/1000);setRun(completed);await refreshRuns();setSelectedRunId(completed.id);}
    catch(e){setError(e)}finally{setBusy(false)}
  }

  return <>
    <PageHeader eyebrow="Run management" title="Create a new 60-day simulation" subtitle="Additional runs are stored separately. The frozen Submitted Run and its history are never rewritten."/>
    <InfoBanner><LockKeyhole size={18}/><strong>Append-only workflow:</strong> changing the model or running again creates a separate operating history. Completed historical transactions, inventory movements, Store Brain events and cash records have no normal edit/delete path.</InfoBanner>

    <div className="two-col">
      <SectionCard title="1 · Initialise store" subtitle="Snapshot the 60-product catalogue, opening inventory, A$15,000 operating cash and declared model configuration.">
        <label className="field"><span>Random seed</span><input type="number" min="1" step="1" value={seed} disabled={Boolean(run)||busy} onChange={e=>setSeed(e.target.value)}/><small>The seed makes a run reproducible for development/testing. Exact replay is not required by the assignment.</small></label>
        <button className="button primary wide" disabled={busy||Boolean(run)} onClick={initialise}>{busy?<><RefreshCw size={17} className="spin"/> Initialising…</>:<><Play size={17}/> Initialise new run</>}</button>
      </SectionCard>

      <SectionCard title="2 · Execute simulation" subtitle="Run all 60 days server-side. No live animation is required; the complete history is persisted to SQLite.">
        {run ? <div className="run-ready"><div><span>Run code</span><strong>{run.run_code}</strong></div><div><span>Status</span><StatusPill status={run.status==='COMPLETED'?'PASS':'INFO'}>{run.status}</StatusPill></div><div><span>Opening inventory</span><strong>{money(run.opening_inventory_cost)}</strong></div><div><span>Operating cash</span><strong>{money(run.opening_operating_cash)}</strong></div></div> : <div className="empty-panel">Initialise a run first.</div>}
        <button className="button primary wide" disabled={busy||!run||run.status!=='INITIALIZED'} onClick={execute}>{busy?<><RefreshCw size={17} className="spin"/> Simulating 60 days…</>:<><Clock3 size={17}/> Run 60-day simulation</>}</button>
        {elapsed!=null&&<div className="success-strip"><CheckCircle2 size={18}/><span>Completed in {elapsed.toFixed(2)} seconds. Reports and assurance are now available.</span></div>}
        {run?.status==='COMPLETED'&&<button className="button secondary wide" onClick={()=>navigate('/overview')}>Open completed run</button>}
      </SectionCard>
    </div>
    {error&&<ErrorState error={error}/>} 
  </>;
}
