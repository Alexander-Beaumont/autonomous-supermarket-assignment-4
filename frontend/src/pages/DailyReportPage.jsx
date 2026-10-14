import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useOutletContext } from 'react-router-dom';
import { ChevronLeft, ChevronRight, PackageOpen, ReceiptText, ShoppingBasket, Users, WalletCards } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api.js';
import { dateAU, integer, money } from '../format.js';
import { useApiData } from '../useApiData.js';
import { DataTable, ErrorState, InfoBanner, KpiCard, LoadingState, PageHeader, SectionCard, SeverityPill, StatusPill } from '../components/UI.jsx';

function initialDay(search) {
  const value = Number(new URLSearchParams(search).get('day'));
  return Number.isInteger(value) && value >= 1 && value <= 60 ? value : 1;
}

export default function DailyReportPage() {
  const location = useLocation();
  const { runId } = useOutletContext();
  const [day, setDay] = useState(() => initialDay(location.search));
  const [txQuery, setTxQuery] = useState('');
  useEffect(() => { setDay(initialDay(location.search)); }, [location.search]);
  const state = useApiData(() => api.day(runId, day), [runId, day]);

  const filteredTransactions = useMemo(() => {
    if (!state.data) return [];
    const q = txQuery.trim().toLowerCase();
    return q ? state.data.transactions.filter(t => `${t.transaction_code} ${t.customer_code}`.toLowerCase().includes(q)) : state.data.transactions;
  }, [state.data, txQuery]);

  if (state.loading) return <LoadingState label={`Loading Daily Report ${day}…`}/>;
  if (state.error) return <ErrorState error={state.error}/>;
  const data = state.data;
  const d = data.day;

  return <>
    <PageHeader eyebrow="Stored daily audit evidence" title={`Daily Report · Day ${day}`} subtitle={`${d.day_of_week}, ${dateAU(d.simulated_date)} · one reusable view for Days 1–60.`}
      actions={<div className="day-controls"><button className="icon-button" aria-label="Previous day" disabled={day<=1} onClick={()=>setDay(v=>v-1)}><ChevronLeft size={18}/></button><select value={day} onChange={e=>setDay(Number(e.target.value))}>{Array.from({length:60},(_,i)=><option key={i+1} value={i+1}>Day {i+1}</option>)}</select><button className="icon-button" aria-label="Next day" disabled={day>=60} onClick={()=>setDay(v=>v+1)}><ChevronRight size={18}/></button></div>}
    />

    <InfoBanner><strong>Daily operating sequence:</strong> replenishment receipts → expiry/write-off → customer activity & sales → closing Store Brain review → next-day order placement. Day 60 has no new replenishment order.</InfoBanner>

    <div className="kpi-grid kpi-grid-4">
      <KpiCard label="Customer visits" value={integer(d.customer_visits)} icon={Users}/>
      <KpiCard label="Transactions" value={integer(d.transactions)} detail={`${integer(d.units_sold)} units sold`} icon={ReceiptText}/>
      <KpiCard label="Revenue" value={money(d.revenue)} detail={`${money(d.cogs)} COGS · ${money(d.gross_profit)} gross profit`} icon={ShoppingBasket} tone="positive"/>
      <KpiCard label="Closing cash" value={money(d.closing_cash)} detail={`Opened ${money(d.opening_cash)} · ${money(d.replenishment_spend)} orders`} icon={WalletCards}/>
      <KpiCard label="Expiry units" value={integer(d.expiry_units)} detail={`${money(d.expiry_writeoff_value)} write-off`} icon={PackageOpen}/>
      <KpiCard label="Received units" value={integer(d.replenishment_received_units)} detail="Ordered at prior day-end"/>
      <KpiCard label="Low / sold out" value={`${d.low_stock_events} / ${d.stockout_events}`} detail="Closing inventory states" tone={d.stockout_events ? 'danger':'default'}/>
      <KpiCard label="Expiry / slow mover alerts" value={`${d.expiry_warning_events} / ${d.slow_moving_events}`} detail="Closing Store Brain conditions"/>
      <KpiCard label="Cash constraints" value={integer(d.cash_constraint_events)} detail="Business constraint; not an integrity failure" tone={d.cash_constraint_events ? 'danger':'positive'}/>
    </div>

    <div className="two-col">
      <SectionCard title="Customer activity by time" subtitle="Visits and completed transactions across the simulated day.">
        <div className="chart-medium"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.customers.byPeriod}><CartesianGrid vertical={false} strokeDasharray="3 3"/><XAxis dataKey="arrival_period"/><YAxis/><Tooltip/><Bar dataKey="visits" fill="var(--chart-primary)" radius={[5,5,0,0]}/><Bar dataKey="transactions" fill="var(--chart-secondary)" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>
      </SectionCard>
      <SectionCard title="Demand outcomes" subtitle="Demand attempts are retained even where an item could not be supplied or was substituted.">
        <DataTable rowKey="outcome" rows={data.demandOutcomes} columns={[
          {key:'outcome',label:'Outcome',render:v=><span className="tag">{v.replaceAll('_',' ')}</span>},
          {key:'events',label:'Events',align:'right'}, {key:'requested_units',label:'Requested',align:'right'}, {key:'fulfilled_units',label:'Fulfilled',align:'right'}
        ]}/>
      </SectionCard>
    </div>

    <div className="two-col">
      <SectionCard title="Customer mix" subtitle="Stored shopping visits by customer type for this day.">
        <DataTable rowKey="customer_type" rows={data.customers.byType} columns={[
          {key:'customer_type',label:'Customer type'}, {key:'visits',label:'Visits',align:'right'}, {key:'fulfilled_units',label:'Fulfilled units',align:'right'}
        ]}/>
      </SectionCard>
      <SectionCard title="Shopping missions" subtitle="The demand-driving mission mix retained for this day.">
        <DataTable rowKey="shopping_mission" rows={data.customers.byMission} columns={[
          {key:'shopping_mission',label:'Mission'}, {key:'visits',label:'Visits',align:'right'}, {key:'fulfilled_units',label:'Fulfilled units',align:'right'}
        ]}/>
      </SectionCard>
    </div>

    <SectionCard title="Store Brain decisions & alerts" subtitle="The condition, autonomous action and recorded outcome for this day.">
      {data.brainEvents.length ? <div className="event-grid compact-events">{data.brainEvents.map(event=><article className="event-card" key={event.id}>
        <div className="event-meta"><SeverityPill severity={event.severity}/><span>{event.event_type.replaceAll('_',' ')}</span></div>
        <h3>{event.product_name || 'Store-level event'}</h3>
        <div className="event-chain"><p><strong>Condition</strong>{event.condition_text}</p><p><strong>Action</strong>{event.action_text}</p><p><strong>Outcome</strong>{event.outcome_text}</p></div>
      </article>)}</div> : <div className="empty-panel">No Store Brain alerts or autonomous actions were recorded for this day.</div>}
    </SectionCard>

    <SectionCard title="Replenishment orders placed" subtitle="Order cost is deducted immediately; stock is received before the following day’s customers arrive.">
      {data.replenishmentOrders.length ? data.replenishmentOrders.map(order=><div className="order-block" key={order.id}>
        <div className="order-header"><div><strong>{order.order_code}</strong><span>Day {order.order_day} → Day {order.receive_day}</span></div><div><span>{money(order.cash_before)} cash before</span><strong>{money(order.total_cost)} spend</strong><span>{money(order.cash_after)} cash after</span>{Boolean(order.cash_constrained)&&<StatusPill status="WATCH">CASH-LIMITED</StatusPill>}</div></div>
        <DataTable rowKey="product_id" rows={order.items} columns={[
          {key:'product_name',label:'Product'}, {key:'reason',label:'Reason'}, {key:'desired_quantity',label:'Desired',align:'right'}, {key:'ordered_quantity',label:'Ordered',align:'right'}, {key:'line_cost',label:'Cost',align:'right',render:v=>money(v)}, {key:'priority_score',label:'Priority',align:'right'}
        ]}/>
      </div>) : <div className="empty-panel">No replenishment order was placed on this day{day === 60 ? ' because the model horizon ends at Day 60.' : '.'}</div>}
    </SectionCard>

    <SectionCard title="Recorded transactions" subtitle="Each completed sale retains its line items, revenue and COGS for audit."
      action={<input className="compact-input" value={txQuery} onChange={e=>setTxQuery(e.target.value)} placeholder="Find TX or customer…"/>}>
      <div className="transaction-list">
        {filteredTransactions.map(tx=><details className="transaction-row" key={tx.id}>
          <summary><span><strong>{tx.transaction_code}</strong><small>{tx.customer_code} · {tx.arrival_period}</small></span><span>{tx.units} units</span><strong>{money(tx.total)}</strong></summary>
          <div className="transaction-detail"><DataTable rowKey={(r,i)=>`${r.product_id}-${i}`} rows={tx.items} columns={[
            {key:'product_name',label:'Product'}, {key:'category',label:'Category'}, {key:'quantity',label:'Qty',align:'right'}, {key:'unit_sell_price',label:'Sell price',align:'right',render:v=>money(v)}, {key:'line_revenue',label:'Revenue',align:'right',render:v=>money(v)}, {key:'line_cogs',label:'COGS',align:'right',render:v=>money(v)}
          ]}/><div className="tx-totals"><span>COGS <strong>{money(tx.cogs)}</strong></span><span>Gross profit <strong>{money(tx.gross_profit)}</strong></span></div><Link className="text-link" to={`/audit?transaction=${encodeURIComponent(tx.transaction_code)}`}>Trace this transaction in Audit Explorer</Link></div>
        </details>)}
      </div>
    </SectionCard>

    <details className="card disclosure-card"><summary><span>Inventory movement ledger · Day {day}</span><small>{data.inventoryMovements.length} movement records</small></summary><div className="disclosure-body"><DataTable rowKey="id" rows={data.inventoryMovements} columns={[
      {key:'product_name',label:'Product'}, {key:'movement_type',label:'Movement'}, {key:'quantity',label:'Qty',align:'right'}, {key:'quantity_delta',label:'Δ stock',align:'right'}, {key:'movement_value',label:'Cost value',align:'right',render:v=>money(v)}, {key:'reference_id',label:'Reference'}, {key:'batch_reference',label:'Batch'}
    ]}/></div></details>

    <details className="card disclosure-card"><summary><span>Closing stock position · Day {day}</span><small>{data.closingStock.length} products</small></summary><div className="disclosure-body"><DataTable rowKey="product_id" rows={data.closingStock} columns={[
      {key:'product_id',label:'ID'}, {key:'name',label:'Product'}, {key:'category',label:'Category'}, {key:'closing_quantity',label:'Closing qty',align:'right'}
    ]}/></div></details>
  </>;
}
