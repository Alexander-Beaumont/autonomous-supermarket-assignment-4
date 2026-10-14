import { useMemo, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { ArrowRight, BrainCircuit, CircleDollarSign, PackageX, RefreshCcw, ShieldAlert, TimerReset } from 'lucide-react';
import { api } from '../api.js';
import { integer, money } from '../format.js';
import { useApiData } from '../useApiData.js';
import { DataTable, ErrorState, InfoBanner, KpiCard, LoadingState, PageHeader, SectionCard, SeverityPill, StatusPill } from '../components/UI.jsx';

const EVENT_ICONS = { SOLD_OUT:PackageX, LOW_STOCK:ShieldAlert, EXPIRY_WARNING:TimerReset, SLOW_MOVING:RefreshCcw, REPLENISHMENT:BrainCircuit, CASH_CONSTRAINT:CircleDollarSign };

export default function StoreBrainPage() {
  const { runId } = useOutletContext();
  const state = useApiData(() => api.brain(runId), [runId]);
  const [type, setType] = useState('ALL');
  const [day, setDay] = useState('ALL');
  const filtered = useMemo(() => {
    if (!state.data) return [];
    return state.data.events.filter(e => (type==='ALL'||e.event_type===type) && (day==='ALL'||e.day_number===Number(day)));
  }, [state.data,type,day]);
  if (state.loading) return <LoadingState/>;
  if (state.error) return <ErrorState error={state.error}/>;
  const { summary, events, orders } = state.data;
  const count = key => summary.find(s=>s.event_type===key)?.count || 0;

  return <>
    <PageHeader eyebrow="Autonomous Store Brain" title="Explainable operations" subtitle="A transparent rule-based controller that converts inventory conditions into recorded actions while respecting cash and the one-day lead time."/>
    <InfoBanner><strong>No manager approval is simulated.</strong> Replenishment decisions are autonomous. The remote manager receives the condition, action and outcome trail shown below.</InfoBanner>
    <div className="kpi-grid kpi-grid-3">
      {['SOLD_OUT','LOW_STOCK','EXPIRY_WARNING','SLOW_MOVING','REPLENISHMENT','CASH_CONSTRAINT'].map(key=>{
        const Icon=EVENT_ICONS[key]; return <KpiCard key={key} label={key.replaceAll('_',' ')} value={integer(count(key))} icon={Icon} tone={key==='SOLD_OUT'||key==='CASH_CONSTRAINT'?'danger':'default'}/>;
      })}
    </div>

    <SectionCard title="Decision ledger" subtitle={`${integer(events.length)} Store Brain records retained across the selected run.`}
      action={<div className="table-tools"><select value={type} onChange={e=>setType(e.target.value)}><option value="ALL">All event types</option>{[...new Set(events.map(e=>e.event_type))].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select><select value={day} onChange={e=>setDay(e.target.value)}><option value="ALL">All days</option>{Array.from({length:60},(_,i)=><option key={i+1} value={i+1}>Day {i+1}</option>)}</select></div>}>
      <div className="event-ledger">
        {!filtered.length && <div className="empty-panel">No Store Brain records match the selected filters.</div>}
        {filtered.slice(0,300).map(event=><article key={event.id} className="ledger-row">
          <div className="ledger-day">D{String(event.day_number).padStart(2,'0')}</div>
          <div className="ledger-main"><div><SeverityPill severity={event.severity}/><strong>{event.event_type.replaceAll('_',' ')}</strong><span>{event.product_name || 'Store-level control'}</span></div><p>{event.condition_text}</p><small><b>Action:</b> {event.action_text}</small><small><b>Outcome:</b> {event.outcome_text}</small></div>
          <Link to={`/daily?day=${event.day_number}`} aria-label={`Open Day ${event.day_number}`}><ArrowRight size={17}/></Link>
        </article>)}
      </div>
      {filtered.length > 300 && <div className="table-note">Showing the first 300 matching records. Narrow the event/day filters to inspect a specific decision set.</div>}
    </SectionCard>

    <SectionCard title="Autonomous replenishment orders" subtitle="Consolidated daily purchase orders with affordability evidence.">
      <DataTable rowKey="id" rows={orders} columns={[
        {key:'order_code',label:'Order'}, {key:'order_day',label:'Placed',render:v=>`Day ${v}`}, {key:'receive_day',label:'Received',render:v=>`Day ${v}`},
        {key:'total_cost',label:'Cost',align:'right',render:v=>money(v)}, {key:'cash_before',label:'Cash before',align:'right',render:v=>money(v)}, {key:'cash_after',label:'Cash after',align:'right',render:v=>money(v)},
        {key:'cash_constrained',label:'Cash rule',render:v=><StatusPill status={v?'WATCH':'PASS'}>{v?'CASH-LIMITED':'WITHIN CASH'}</StatusPill>}
      ]}/>
    </SectionCard>
  </>;
}
