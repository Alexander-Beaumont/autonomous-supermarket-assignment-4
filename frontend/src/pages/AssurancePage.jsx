import { useOutletContext } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, Boxes, Database, Equal, ReceiptText, WalletCards } from 'lucide-react';
import { api } from '../api.js';
import { integer, money } from '../format.js';
import { useApiData } from '../useApiData.js';
import { DataTable, ErrorState, InfoBanner, KpiCard, LoadingState, PageHeader, SectionCard, StatusPill } from '../components/UI.jsx';

export default function AssurancePage() {
  const { runId } = useOutletContext();
  const state = useApiData(() => api.assurance(runId), [runId]);
  if (state.loading) return <LoadingState label="Recomputing assurance checks from stored history…"/>;
  if (state.error) return <ErrorState error={state.error}/>;
  const a = state.data;
  const s = a.summary;
  const IntegrityIcon = a.overallStatus === 'PASS' ? BadgeCheck : AlertTriangle;

  return <>
    <PageHeader eyebrow="Client acceptance · Part 4" title="Commercial Assurance" subtitle="Independent reconciliation of the append-only simulation history. PASS means the records are internally consistent; it does not mean every business outcome was favourable."/>

    <div className={`assurance-hero assurance-page-hero ${a.overallStatus === 'PASS'?'pass':'fail'}`}>
      <div><span>Overall integrity status</span><strong>{a.overallStatus}</strong><p>Run {a.run.run_code} · Engine {a.run.engine_version}</p></div><IntegrityIcon size={52}/>
    </div>

    <InfoBanner tone={a.overallStatus==='PASS'?'success':'warning'}><strong>Important distinction:</strong> stockouts, expiry, slow-moving stock and low cash are commercial outcomes. Integrity fails only where stored history contradicts itself — for example negative stock, expired-product sales, unreconciled revenue or unexplained cash movement.</InfoBanner>

    <div className="kpi-grid kpi-grid-4">
      <KpiCard label="History completeness" value={`${s.historyCompleteness.daysRetained}/60`} detail={`${integer(s.historyCompleteness.counts.transactions)} transactions retained`} icon={Database} tone={s.historyCompleteness.status==='PASS'?'positive':'danger'}/>
      <KpiCard label="Inventory reconciliation" value={s.inventoryReconciliation.status} detail={`${s.inventoryReconciliation.productsChecked} products · ${s.inventoryReconciliation.negativeStockIncidents} negative · ${s.inventoryReconciliation.oversellingIncidents} oversold`} icon={Boxes} tone={s.inventoryReconciliation.status==='PASS'?'positive':'danger'}/>
      <KpiCard label="Revenue reconciliation" value={s.revenueReconciliation.status} detail={`60-day difference ${money(s.revenueReconciliation.totalDifference)}`} icon={ReceiptText} tone={s.revenueReconciliation.status==='PASS'?'positive':'danger'}/>
      <KpiCard label="Cash reconciliation" value={s.cashReconciliation.status} detail={`Final difference ${money(s.cashReconciliation.finalCashDifference)}`} icon={WalletCards} tone={s.cashReconciliation.status==='PASS'?'positive':'danger'}/>
    </div>

    <div className="formula-grid">
      <div className="formula-card"><span>Inventory</span><strong>Opening + received − sold − written off = closing</strong><small>Checked product-by-product, plus a sequential negative-stock scan.</small></div>
      <div className="formula-card"><span>Revenue</span><strong>Daily revenue = Σ transaction totals</strong><small>Then Σ daily revenue = the reported 60-day revenue.</small></div>
      <div className="formula-card"><span>Operating cash</span><strong>Closing = opening + sales − replenishment</strong><small>Every order is also checked against cash available when placed.</small></div>
    </div>

    <SectionCard title="History completeness" subtitle="Relevant records retained for audit of the same identifiable completed run.">
      <div className="record-count-grid">
        {Object.entries(s.historyCompleteness.counts).map(([key,value])=><div key={key}><span>{key.replace(/([A-Z])/g,' $1')}</span><strong>{integer(value)}</strong></div>)}
      </div>
    </SectionCard>

    <SectionCard title="Additional integrity controls" subtitle="Beyond the required reconciliations, the prototype cross-checks transaction arithmetic, Daily Report roll-ups and replenishment mechanics.">
      <div className="assurance-grid">
        <div className="assurance-card"><StatusPill status={s.transactionIntegrity.status}/><strong>Transaction & cash-receipt integrity</strong><small>{integer(s.transactionIntegrity.transactionsChecked)} transactions checked against line items and one matching sale cash receipt · {integer(s.transactionIntegrity.failures)} failure(s)</small></div>
        <div className="assurance-card"><StatusPill status={s.dailyReportIntegrity.status}/><strong>Daily Report roll-ups</strong><small>{integer(s.dailyReportIntegrity.daysChecked)} days checked against underlying customers, transactions, inventory events and Store Brain records · {integer(s.dailyReportIntegrity.failures)} failure(s)</small></div>
        <div className="assurance-card"><StatusPill status={s.replenishmentIntegrity.status}/><strong>Replenishment mechanics</strong><small>{integer(s.replenishmentIntegrity.ordersChecked)} orders checked for affordability, line totals, one-day lead time, Day-60 rule and receipt completeness · {integer(s.replenishmentIntegrity.failures)} failure(s)</small></div>
      </div>
    </SectionCard>

    <SectionCard title="Inventory reconciliation by product" subtitle="The closing quantity is independently reconstructed from opening stock, replenishment receipts, sales and write-offs.">
      <DataTable rowKey="product_id" rows={a.inventoryRows} columns={[
        {key:'name',label:'Product'}, {key:'opening_stock',label:'Opening',align:'right'}, {key:'replenishment_received',label:'+ Received',align:'right'}, {key:'units_sold',label:'− Sold',align:'right'}, {key:'units_written_off',label:'− Write-off',align:'right'}, {key:'closing_stock',label:'= Closing',align:'right'}, {key:'difference',label:'Difference',align:'right'}, {key:'status',label:'Status',render:v=><StatusPill status={v}/>} 
      ]}/>
      <div className="integrity-foot"><span>Negative-stock incidents <strong>{a.negativeStockIncidents.length}</strong></span><span>Overselling incidents <strong>{a.oversellingIncidents.length}</strong></span><span>Expired-product sales <strong>{a.expiredSales.length}</strong></span></div>
    </SectionCard>

    <div className="two-col">
      <SectionCard title="60-day revenue reconciliation" subtitle="Two independent roll-ups from stored history.">
        <div className="reconcile-equation"><span>{money(a.revenueTotals.dailyRevenueSum)}<small>Σ daily revenue</small></span><Equal/><span>{money(a.revenueTotals.transactionRevenueSum)}<small>Σ transactions</small></span><StatusPill status={s.revenueReconciliation.status}/></div>
      </SectionCard>
      <SectionCard title="60-day cash reconciliation" subtitle="Opening operating cash, sales receipts and replenishment payments only.">
        <div className="cash-equation"><div><span>Opening cash</span><strong>{money(a.wholeCash.openingCash)}</strong></div><div><span>+ Sales revenue</span><strong>{money(a.wholeCash.salesRevenue)}</strong></div><div><span>− Replenishment</span><strong>{money(a.wholeCash.replenishmentSpending)}</strong></div><div className="equation-total"><span>= Closing cash</span><strong>{money(a.wholeCash.recordedClosingCash)}</strong></div></div>
      </SectionCard>
    </div>

    <details className="card disclosure-card"><summary><span>Daily revenue checks</span><small>{a.revenueRows.length} / {a.revenueRows.length} days evaluated</small></summary><div className="disclosure-body"><DataTable rowKey="day_number" rows={a.revenueRows} columns={[
      {key:'day_number',label:'Day'}, {key:'reported_revenue',label:'Daily report',align:'right',render:v=>money(v)}, {key:'transaction_revenue',label:'Transaction sum',align:'right',render:v=>money(v)}, {key:'difference',label:'Difference',align:'right',render:v=>money(v)}, {key:'status',label:'Status',render:v=><StatusPill status={v}/>} 
    ]}/></div></details>

    <details className="card disclosure-card"><summary><span>Daily operating-cash checks</span><small>{a.cashRows.length} days evaluated</small></summary><div className="disclosure-body"><DataTable rowKey="day_number" rows={a.cashRows} columns={[
      {key:'day_number',label:'Day'}, {key:'opening_cash',label:'Opening',align:'right',render:v=>money(v)}, {key:'revenue',label:'+ Revenue',align:'right',render:v=>money(v)}, {key:'replenishment_spend',label:'− Orders',align:'right',render:v=>money(v)}, {key:'closing_cash',label:'Closing',align:'right',render:v=>money(v)}, {key:'difference',label:'Difference',align:'right',render:v=>money(v)}, {key:'status',label:'Status',render:v=><StatusPill status={v}/>} 
    ]}/></div></details>

    <details className="card disclosure-card"><summary><span>Replenishment cash, lead-time & receipt checks</span><small>{a.orderChecks.length} orders evaluated</small></summary><div className="disclosure-body"><DataTable rowKey="order_code" rows={a.orderChecks} columns={[
      {key:'order_code',label:'Order'}, {key:'order_day',label:'Placed'}, {key:'receive_day',label:'Received'}, {key:'ordered_units',label:'Ordered units',align:'right'}, {key:'received_units',label:'Receipt units',align:'right'}, {key:'total_cost',label:'Cost',align:'right',render:v=>money(v)}, {key:'cash_before',label:'Cash before',align:'right',render:v=>money(v)}, {key:'cash_after',label:'Cash after',align:'right',render:v=>money(v)}, {key:'status',label:'Status',render:v=><StatusPill status={v}/>} 
    ]}/></div></details>

    <details className="card disclosure-card"><summary><span>Daily Report roll-up checks</span><small>{a.dailyRollupRows.length} days evaluated</small></summary><div className="disclosure-body"><DataTable rowKey="day_number" rows={a.dailyRollupRows} columns={[
      {key:'day_number',label:'Day'}, {key:'customer_visits',label:'Customers',align:'right'}, {key:'transactions',label:'Transactions',align:'right'}, {key:'units_sold',label:'Units',align:'right'}, {key:'expiry_units',label:'Expiry units',align:'right'}, {key:'replenishment_ordered_units',label:'Ordered units',align:'right'}, {key:'status',label:'Status',render:v=><StatusPill status={v}/>}
    ]}/></div></details>

    <SectionCard title="Exceptions & disclosure" subtitle="Any material integrity failure must be surfaced here rather than hidden by presentation.">
      <div className="exception-list">{a.exceptions.map((e,i)=><div key={i}><StatusPill status={a.overallStatus}/><div><strong>{e.area}</strong><p>{e.detail}</p></div></div>)}</div>
    </SectionCard>
  </>;
}
