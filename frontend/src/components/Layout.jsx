import { NavLink, Outlet } from 'react-router-dom';
import {
  Activity, BarChart3, BrainCircuit, ClipboardCheck, DatabaseZap,
  FileSearch2, LayoutDashboard, PlayCircle, Settings2, Store
} from 'lucide-react';

const NAV = [
  { to:'/overview', label:'Executive Overview', icon:LayoutDashboard },
  { to:'/model', label:'Model & Setup', icon:Settings2 },
  { to:'/report', label:'60-Day Report', icon:BarChart3 },
  { to:'/daily', label:'Daily Reports', icon:Activity },
  { to:'/brain', label:'Store Brain', icon:BrainCircuit },
  { to:'/assurance', label:'Commercial Assurance', icon:ClipboardCheck },
  { to:'/audit', label:'Audit Explorer', icon:FileSearch2 },
  { to:'/new-run', label:'New Simulation', icon:PlayCircle }
];

export default function Layout({ runs, selectedRunId, setSelectedRunId, refreshRuns }) {
  const completedRuns = runs.filter(r => r.status === 'COMPLETED');
  const selected = runs.find(r => Number(r.id) === Number(selectedRunId));

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Store size={24}/></div><div><strong>Autonomous</strong><span>Supermarket</span></div></div>
      <nav>
        {NAV.map(item => <NavLink key={item.to} to={item.to} className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
          <item.icon size={18}/><span>{item.label}</span>
        </NavLink>)}
      </nav>
      <div className="sidebar-foot">
        <DatabaseZap size={16}/><span>SQLite audit history</span>
      </div>
    </aside>

    <main className="main-shell">
      <div className="topbar">
        <div className="topbar-context">
          <span className="dot-online" />
          <div><strong>Operations Console</strong><small>Melbourne CBD · 60-day simulation</small></div>
        </div>
        <label className="run-picker">
          <span>Evidence run</span>
          <select value={selectedRunId || ''} onChange={e => setSelectedRunId(Number(e.target.value))}>
            {completedRuns.map(run => <option value={run.id} key={run.id}>{run.is_submitted ? '★ ' : ''}{run.run_code}</option>)}
          </select>
        </label>
      </div>
      {selected && <div className="run-ribbon">
        <span className={selected.is_submitted ? 'submitted-badge' : 'secondary-badge'}>{selected.is_submitted ? 'SUBMITTED RUN' : 'COMPLETED RUN'}</span>
        <span>{selected.run_code}</span><span className="ribbon-sep">•</span><span>Seed {selected.seed}</span><span className="ribbon-sep">•</span><span>Engine {selected.engine_version}</span>
      </div>}
      <div className="content"><Outlet context={{ runId:selectedRunId, selectedRun:selected, runs, refreshRuns, setSelectedRunId }} /></div>
    </main>
  </div>;
}
