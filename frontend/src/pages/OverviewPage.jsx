import { useOutletContext, Link } from 'react-router-dom';
import { ArrowRight, Banknote, Boxes, CircleDollarSign, ShieldCheck, ShoppingBasket, TrendingUp, Users } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api.js';
import { money, integer, pct } from '../format.js';
import { useApiData } from '../useApiData.js';
import { ErrorState, InfoBanner, KpiCard, LoadingState, PageHeader, SectionCard, StatusPill } from '../components/UI.jsx';

export default function OverviewPage() {
  const { runId, selectedRun } = useOutletContext();
  const state = useApiData(() => runId ? Promise.all([api.summary(runId), api.report(runId)]) : Promise.resolve(null), [runId]);
  if (state.loading) return <LoadingState/>;
  if (state.error) return <ErrorState error={state.error}/>;
  if (!state.data) return <ErrorState error={new Error('No completed run is available.')}/>;
  const [summary, report] = state.data;
  const t = summary.totals;
  const p1 = report.part1BusinessPerformance;
  const p2 = report.part2InventoryOperations;
  const assurance = report.part4CommercialAssurance;
  const margin = t.revenue ? (t.gross_profit / t.revenue) * 100 : 0;

  return <>
    <PageHeader
      eyebrow="Remote manager briefing"
      title="Executive overview"
      subtitle="A decision-focused summary of the selected 60-day operating history. Every figure below is derived from the stored SQLite run history."
      actions={<Link className="button primary" to="/report">Open full report <ArrowRight size={16}/></Link>}
    />

    {selectedRun?.is_submitted && <InfoBanner tone="success"><strong>Assessment evidence loaded:</strong> this is the frozen Submitted Run used by the Commercial Report, Daily Reports and assurance checks.</InfoBanner>}

    <div className="kpi-grid kpi-grid-4">
      <KpiCard label="Sales revenue" value={money(t.revenue)} detail={`${integer(t.total_transactions)} transactions`} icon={CircleDollarSign} tone="positive"/>
      <KpiCard label="Gross profit" value={money(t.gross_profit)} detail={`${pct(margin)} gross margin`} icon={TrendingUp} tone="positive"/>
      <KpiCard label="Closing cash" value={money(t.closing_operating_cash)} detail={`Operating liquidity · ${money(t.replenishment_spending)} replenishment spend`} icon={Banknote}/>
      <KpiCard label="Commercial assurance" value={assurance.overallStatus} detail="History, inventory, revenue & cash" icon={ShieldCheck} tone={assurance.overallStatus === 'PASS' ? 'positive' : 'danger'}/>
    </div>

    <div className="two-col">
      <SectionCard title="60-day trading pattern" subtitle="Daily revenue from the selected completed run.">
        <div className="chart-large">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={p1.dailyActivity} margin={{ top:10, right:12, bottom:4, left:0 }}>
              <XAxis dataKey="day_number" tickLine={false} axisLine={false} tick={{fontSize:11}} interval={9}/>
              <YAxis tickLine={false} axisLine={false} tick={{fontSize:11}} tickFormatter={v => `$${Math.round(v/1000)}k`}/>
              <Tooltip formatter={v => money(v)} labelFormatter={d => `Day ${d}`}/>
              <Line type="monotone" dataKey="revenue" stroke="var(--chart-primary)" strokeWidth={2.5} dot={false} activeDot={{r:4}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Operating snapshot" subtitle="Scale, availability and inventory outcomes.">
        <div className="metric-list">
          <div><Users/><span>Total customer visits</span><strong>{integer(t.total_customers)}</strong></div>
          <div><ShoppingBasket/><span>Units sold</span><strong>{integer(t.total_units_sold)}</strong></div>
          <div><Boxes/><span>Closing inventory value</span><strong>{money(t.closing_inventory_value)}</strong></div>
          <div><span className="metric-symbol">!</span><span>Stockout events</span><strong>{integer(p2.eventTotals.stockoutEvents)}</strong></div>
          <div><span className="metric-symbol">↻</span><span>Low-stock events</span><strong>{integer(p2.eventTotals.lowStockEvents)}</strong></div>
          <div><span className="metric-symbol">⌛</span><span>Expiry/write-off value</span><strong>{money(t.expiry_writeoff_value)}</strong></div>
        </div>
      </SectionCard>
    </div>

    <SectionCard title="Three material commercial findings" subtitle="The required Observation → Evidence → Diagnosis → Business implication → Recommendation chain is expanded in Part 3 of the Commercial Report.">
      <div className="finding-grid">
        {report.part3CommercialDiagnosis.findings.map(f => <article className="finding-summary" key={f.position}>
          <div className="finding-number">0{f.position}</div>
          <h3>{f.title}</h3>
          <p>{f.observation}</p>
          <div className="mini-evidence"><strong>Evidence</strong><span>{f.evidence}</span></div>
          <Link to="/report">View diagnosis & recommendation <ArrowRight size={15}/></Link>
        </article>)}
      </div>
    </SectionCard>

    <div className="two-col">
      <SectionCard title="Trust status" subtitle="Integrity problems are distinct from legitimate business outcomes.">
        <div className="assurance-mini-grid">
          {Object.entries(assurance.summary).map(([key, value]) => <div key={key} className="assurance-mini"><StatusPill status={value.status}/><span>{key.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</span></div>)}
        </div>
        <Link className="text-link" to="/assurance">Inspect reconciliation evidence <ArrowRight size={15}/></Link>
      </SectionCard>
      <SectionCard title="Model boundary" subtitle="Interpret the result as prototype evidence, not a real-store forecast.">
        <p className="body-copy">The simulation excludes premises, rent, fit-out, refrigeration, utilities, insurance, autonomous-store hardware and corporate overhead. It uses synthetic customer demand because no historical data exists for the proposed location.</p>
        <Link className="text-link" to="/model">Read the complete Model Declaration <ArrowRight size={15}/></Link>
      </SectionCard>
    </div>
  </>;
}
