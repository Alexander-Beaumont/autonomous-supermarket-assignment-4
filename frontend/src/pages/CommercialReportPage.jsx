import { Link, useOutletContext } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Banknote, Boxes, CircleDollarSign, PackageCheck, ReceiptText, ShoppingBasket, TrendingUp, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api.js';
import { decimal, integer, money, pct } from '../format.js';
import { useApiData } from '../useApiData.js';
import { DataTable, ErrorState, InfoBanner, KpiCard, LoadingState, PageHeader, SectionCard, SeverityPill, StatusPill } from '../components/UI.jsx';

export default function CommercialReportPage() {
  const { runId } = useOutletContext();
  const state = useApiData(() => api.report(runId), [runId]);
  if (state.loading) return <LoadingState/>;
  if (state.error) return <ErrorState error={state.error}/>;
  const report = state.data;
  const p1 = report.part1BusinessPerformance;
  const p2 = report.part2InventoryOperations;
  const p3 = report.part3CommercialDiagnosis;
  const p4 = report.part4CommercialAssurance;
  const s = p1.storePerformance;
  const margin = s.revenue ? s.gross_profit / s.revenue * 100 : 0;

  return <>
    <PageHeader eyebrow="Client acceptance report" title="60-Day Commercial Report" subtitle="Four fixed acceptance areas, all generated from the same stored run history."/>
    <InfoBanner><strong>Traceability:</strong> report totals are derived from the selected completed run. Use Daily Reports and Audit Explorer to move from an aggregate figure to underlying transactions, inventory movements and Store Brain events.</InfoBanner>

    <nav className="anchor-nav">
      <a href="#part1">1 · Business performance</a><a href="#part2">2 · Inventory & operations</a><a href="#part3">3 · Diagnosis & recommendations</a><a href="#part4">4 · Commercial assurance</a>
    </nav>

    <section id="part1" className="report-section">
      <div className="report-part-heading"><span>Part 1</span><div><h2>Business Performance</h2><p>Client question: What happened to the business over the 60 days?</p></div></div>
      <div className="kpi-grid kpi-grid-3">
        <KpiCard label="Customer visits" value={integer(s.total_customers)} detail={`${decimal(p1.shopperPerformance.averageCustomersPerDay,1)} per day`} icon={Users}/>
        <KpiCard label="Transactions" value={integer(s.total_transactions)} detail={`${money(p1.shopperPerformance.averageTransactionValue)} average value`} icon={ReceiptText}/>
        <KpiCard label="Units sold" value={integer(s.total_units_sold)} detail={`${decimal(p1.shopperPerformance.averageBasketSize,2)} units / transaction`} icon={ShoppingBasket}/>
        <KpiCard label="Sales revenue" value={money(s.revenue)} icon={CircleDollarSign} tone="positive"/>
        <KpiCard label="COGS" value={money(s.cogs)} detail="Acquisition cost of units sold" icon={Boxes}/>
        <KpiCard label="Gross profit" value={money(s.gross_profit)} detail={`${pct(margin)} gross margin`} icon={TrendingUp} tone="positive"/>
        <KpiCard label="Expiry / write-off" value={money(s.expiry_writeoff_value)} detail="Reported separately from COGS" icon={AlertTriangle}/>
        <KpiCard label="Closing operating cash" value={money(s.closing_operating_cash)} icon={Banknote}/>
        <KpiCard label="Closing inventory value" value={money(s.closing_inventory_value)} detail="At purchase cost" icon={PackageCheck}/>
      </div>

      <div className="two-col">
        <SectionCard title="Daily revenue" subtitle="60 consecutive simulated days."><div className="chart-large"><ResponsiveContainer width="100%" height="100%"><LineChart data={p1.dailyActivity}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day_number" tickLine={false}/><YAxis tickLine={false} tickFormatter={v=>`$${Math.round(v/1000)}k`}/><Tooltip formatter={v=>money(v)} labelFormatter={v=>`Day ${v}`}/><Line dataKey="revenue" type="monotone" stroke="var(--chart-primary)" strokeWidth={2.5} dot={false}/></LineChart></ResponsiveContainer></div></SectionCard>
        <SectionCard title="Weekday vs weekend" subtitle="Average operating-day performance."><DataTable rowKey="period" rows={p1.shopperPerformance.weekdayWeekend} columns={[
          {key:'period',label:'Period'}, {key:'days',label:'Days',align:'right'}, {key:'avg_customers',label:'Avg customers',align:'right'},
          {key:'avg_transactions',label:'Avg transactions',align:'right'}, {key:'avg_revenue',label:'Avg revenue',align:'right',render:v=>money(v)}, {key:'avg_gross_profit',label:'Avg gross profit',align:'right',render:v=>money(v)}
        ]}/></SectionCard>
      </div>

      <div className="two-col">
        <SectionCard title="Customer activity across 60 days" subtitle="Daily shopping visits and completed transactions from the stored run.">
          <div className="chart-large"><ResponsiveContainer width="100%" height="100%"><LineChart data={p1.dailyActivity}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day_number" tickLine={false}/><YAxis tickLine={false}/><Tooltip labelFormatter={v=>`Day ${v}`}/><Legend/><Line dataKey="customer_visits" name="Customer visits" type="monotone" stroke="var(--chart-primary)" strokeWidth={2.4} dot={false}/><Line dataKey="transactions" name="Transactions" type="monotone" stroke="var(--chart-secondary)" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div>
        </SectionCard>
        <SectionCard title="Customer-type performance" subtitle="Visit mix and basket fulfilment across the complete Submitted Run.">
          <DataTable rowKey="customer_type" rows={p1.shopperPerformance.byCustomerType} columns={[
            {key:'customer_type',label:'Customer type'}, {key:'visits',label:'Visits',align:'right'}, {key:'purchasing_visits',label:'Transactions',align:'right'}, {key:'avg_intended_basket',label:'Avg intended',align:'right'}, {key:'avg_fulfilled_units',label:'Avg fulfilled',align:'right'}
          ]}/>
        </SectionCard>
      </div>

      <SectionCard title="Category performance" subtitle="Units sold, revenue and gross profit generated by completed transaction items.">
        <div className="chart-large"><ResponsiveContainer width="100%" height="100%"><BarChart data={p1.categoryPerformance} margin={{bottom:45}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="category" angle={-22} textAnchor="end" interval={0} tick={{fontSize:11}}/><YAxis tickFormatter={v=>`$${Math.round(v/1000)}k`}/><Tooltip formatter={v=>money(v)}/><Legend/><Bar dataKey="revenue" name="Revenue" fill="var(--chart-primary)" radius={[4,4,0,0]}/><Bar dataKey="gross_profit" name="Gross profit" fill="var(--chart-secondary)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>
        <DataTable rowKey="category" rows={p1.categoryPerformance} columns={[
          {key:'category',label:'Category'}, {key:'units_sold',label:'Units sold',align:'right'}, {key:'revenue',label:'Revenue',align:'right',render:v=>money(v)}, {key:'gross_profit',label:'Gross profit',align:'right',render:v=>money(v)}
        ]}/>
      </SectionCard>

      <div className="two-col">
        <SectionCard title="Top-selling products" subtitle="Ranked by units sold."><DataTable rowKey="product_id" rows={p1.topProducts} columns={[
          {key:'name',label:'Product',render:(v,row)=><Link className="table-link" to={`/audit?product=${encodeURIComponent(row.product_id)}`}>{v}</Link>}, {key:'category',label:'Category'}, {key:'units_sold',label:'Units',align:'right'}, {key:'revenue',label:'Revenue',align:'right',render:v=>money(v)}, {key:'gross_profit',label:'Gross profit',align:'right',render:v=>money(v)}
        ]}/></SectionCard>
        <SectionCard title="Weak / slow-selling products" subtitle="Lowest realised unit sales; interpreted alongside closing stock in Part 2."><DataTable rowKey="product_id" rows={p1.weakProducts} columns={[
          {key:'name',label:'Product',render:(v,row)=><Link className="table-link" to={`/audit?product=${encodeURIComponent(row.product_id)}`}>{v}</Link>}, {key:'category',label:'Category'}, {key:'units_sold',label:'Units',align:'right'}, {key:'revenue',label:'Revenue',align:'right',render:v=>money(v)}
        ]}/></SectionCard>
      </div>
    </section>

    <section id="part2" className="report-section">
      <div className="report-part-heading"><span>Part 2</span><div><h2>Inventory & Autonomous Operations</h2><p>Client question: What operational problems occurred, and what did the Store Brain do?</p></div></div>
      <div className="kpi-grid kpi-grid-3">
        <KpiCard label="Stockout events" value={integer(p2.eventTotals.stockoutEvents)} detail="Closing sold-out conditions" tone="danger"/>
        <KpiCard label="Low-stock events" value={integer(p2.eventTotals.lowStockEvents)} detail="Dynamic days-of-cover threshold"/>
        <KpiCard label="Expiry warnings" value={integer(p2.eventTotals.expiryWarningEvents)} detail="Near-expiry batches identified"/>
        <KpiCard label="Slow-moving events" value={integer(p2.eventTotals.slowMovingEvents)} detail="High cover vs observed sales"/>
        <KpiCard label="Replenishment spend" value={money(p2.totalReplenishmentSpending)} detail="Paid when orders were placed"/>
        <KpiCard label="Cash constraints" value={integer(p2.eventTotals.cashConstraintEvents)} detail="Zero is reported, never omitted" tone={p2.eventTotals.cashConstraintEvents ? 'danger':'positive'}/>
      </div>

      <SectionCard title="Store Brain event coverage" subtitle="All required operating condition/action types are reported; zero-occurrence types remain visible in the KPI row above.">
        <DataTable rowKey="event_type" rows={p2.brainEventSummary} columns={[
          {key:'event_type',label:'Event / action type',render:v=>v.replaceAll('_',' ')}, {key:'count',label:'Records',align:'right'}, {key:'high_severity',label:'High / critical',align:'right'}
        ]}/>
      </SectionCard>

      <div className="two-col">
        <SectionCard title="Availability pressure by product" subtitle="Products with the most sold-out / low-stock conditions and recorded unavailable demand.">
          <DataTable rowKey="product_id" rows={p2.inventoryPressureByProduct} columns={[
            {key:'name',label:'Product',render:(v,row)=><Link className="table-link" to={`/audit?product=${encodeURIComponent(row.product_id)}`}>{v}</Link>}, {key:'stockout_events',label:'Sold out',align:'right'}, {key:'low_stock_events',label:'Low stock',align:'right'}, {key:'unavailable_attempts',label:'Unavailable demand',align:'right'}
          ]}/>
        </SectionCard>
        <SectionCard title="Slow-moving products" subtitle="High inventory cover relative to observed sales; the Store Brain holds routine reorder.">
          <DataTable rowKey="product_id" rows={p2.slowMovingProducts} empty="No slow-moving products were flagged." columns={[
            {key:'name',label:'Product',render:(v,row)=><Link className="table-link" to={`/audit?product=${encodeURIComponent(row.product_id)}`}>{v}</Link>}, {key:'slow_moving_event_days',label:'Flag days',align:'right'}, {key:'units_sold',label:'Units sold',align:'right'}, {key:'closing_quantity',label:'Closing qty',align:'right'}
          ]}/>
        </SectionCard>
      </div>

      <div className="two-col">
        <SectionCard title="Expiry / write-off by product" subtitle="Purchase-cost value removed before customers arrived.">
          <DataTable rowKey="product_id" rows={p2.writeoffsByProduct.length ? p2.writeoffsByProduct : []} empty="No expiry/write-off events were recorded." columns={[
            {key:'name',label:'Product',render:(v,row)=><Link className="table-link" to={`/audit?product=${encodeURIComponent(row.product_id)}`}>{v}</Link>}, {key:'category',label:'Category'}, {key:'units_written_off',label:'Units',align:'right'}, {key:'writeoff_value',label:'Write-off',align:'right',render:v=>money(v)}
          ]}/>
          <details className="inline-disclosure"><summary>Category write-off totals</summary><DataTable rowKey="category" rows={p2.writeoffsByCategory} empty="No category write-offs were recorded." columns={[
            {key:'category',label:'Category'}, {key:'units_written_off',label:'Units',align:'right'}, {key:'writeoff_value',label:'Write-off',align:'right',render:v=>money(v)}
          ]}/></details>
        </SectionCard>
        <SectionCard title="Replenishment quantities & spending" subtitle="All products replenished autonomously within operating cash.">
          <DataTable rowKey="product_id" rows={p2.replenishmentByProduct} columns={[
            {key:'product_name',label:'Product',render:(v,row)=><Link className="table-link" to={`/audit?product=${encodeURIComponent(row.product_id)}`}>{v}</Link>}, {key:'ordered_units',label:'Units',align:'right'}, {key:'order_count',label:'Orders',align:'right'}, {key:'spending',label:'Spend',align:'right',render:v=>money(v)}
          ]}/>
        </SectionCard>
      </div>

      <SectionCard title="Material Store Brain cases" subtitle="Condition detected → autonomous action → recorded outcome. Focused on significant cases rather than every event.">
        <div className="event-grid">
          {p2.materialCases.map((e,i)=><article className="event-card" key={`${e.day_number}-${e.event_type}-${i}`}>
            <div className="event-meta"><span>Day {e.day_number}</span><SeverityPill severity={e.severity}/><span>{e.event_type.replaceAll('_',' ')}</span></div>
            <h3>{e.product_name || 'Operating cash constraint'}</h3>
            <div className="event-chain"><p><strong>Condition</strong>{e.condition_text}</p><p><strong>Action</strong>{e.action_text}</p><p><strong>Outcome</strong>{e.outcome_text}</p></div>
            <Link to={`/daily?day=${e.day_number}`}>Open Daily Report <ArrowRight size={14}/></Link>
          </article>)}
        </div>
      </SectionCard>

      <details className="card disclosure-card"><summary><span>Closing inventory position</span><small>{p2.closingInventory.length} products</small></summary><div className="disclosure-body"><DataTable rowKey="product_id" rows={p2.closingInventory} columns={[
        {key:'name',label:'Product',render:(v,row)=><Link className="table-link" to={`/audit?product=${encodeURIComponent(row.product_id)}`}>{v}</Link>}, {key:'category',label:'Category'}, {key:'closing_quantity',label:'Closing qty',align:'right'}, {key:'closing_value',label:'Closing value',align:'right',render:v=>money(v)}, {key:'units_sold',label:'60-day sales',align:'right'}
      ]}/></div></details>
    </section>

    <section id="part3" className="report-section">
      <div className="report-part-heading"><span>Part 3</span><div><h2>Commercial Diagnosis & Management Recommendations</h2><p>Client question: What should the client consider next?</p></div></div>
      <div className="diagnosis-stack">
        {p3.findings.map(f => <article className="diagnosis-card" key={f.position}>
          <div className="diagnosis-heading"><span>Finding {f.position}</span><h3>{f.title}</h3></div>
          <div className="reasoning-chain">
            <div><span>1</span><strong>Observation</strong><p>{f.observation}</p></div>
            <div><span>2</span><strong>Evidence</strong><p>{f.evidence}</p></div>
            <div><span>3</span><strong>Diagnosis</strong><p>{f.diagnosis}</p></div>
            <div><span>4</span><strong>Business implication</strong><p>{f.business_implication}</p></div>
            <div className="recommendation"><span>5</span><strong>Recommendation</strong><p>{f.recommendation}</p></div>
          </div>
          <div className="limitation"><strong>Material limitation:</strong> {f.limitation}</div>
        </article>)}
      </div>
    </section>

    <section id="part4" className="report-section">
      <div className="report-part-heading"><span>Part 4</span><div><h2>Commercial Assurance</h2><p>Client question: Can the client trust the report?</p></div></div>
      <div className={`assurance-hero ${p4.overallStatus === 'PASS' ? 'pass':'fail'}`}><div><span>Overall assurance</span><strong>{p4.overallStatus}</strong><p>History completeness, inventory, revenue and operating cash are independently reconciled from stored records.</p></div><StatusPill status={p4.overallStatus}/></div>
      <div className="assurance-grid">
        {Object.entries(p4.summary).map(([key,value]) => <div className="assurance-card" key={key}><StatusPill status={value.status}/><strong>{key.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</strong><small>{value.status === 'PASS' ? 'No integrity contradiction detected.' : 'Review exception evidence.'}</small></div>)}
      </div>
      <div className="report-cta"><div><h3>Inspect the equations, product reconciliations and daily checks</h3><p>The dedicated assurance view exposes the evidence behind each PASS/FAIL result.</p></div><Link className="button primary" to="/assurance">Open Commercial Assurance <ArrowRight size={16}/></Link></div>
    </section>
  </>;
}
