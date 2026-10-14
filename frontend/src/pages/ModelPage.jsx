import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Boxes, CalendarDays, CircleDollarSign, Database, LockKeyhole, PackageSearch, Snowflake, WalletCards } from 'lucide-react';
import { api } from '../api.js';
import { dateAU, integer, money, pct } from '../format.js';
import { useApiData } from '../useApiData.js';
import { DataTable, ErrorState, InfoBanner, KpiCard, LoadingState, PageHeader, SectionCard, StatusPill } from '../components/UI.jsx';

const labelize = key => key.replace(/([A-Z])/g,' $1').replace(/^./, s => s.toUpperCase());

export default function ModelPage() {
  const { runId } = useOutletContext();
  const state = useApiData(() => api.model(runId), [runId]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  const filtered = useMemo(() => {
    if (!state.data) return [];
    return state.data.products.filter(p =>
      (category === 'All' || p.category === category) &&
      `${p.product_id} ${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase())
    );
  }, [state.data, query, category]);

  if (state.loading) return <LoadingState/>;
  if (state.error) return <ErrorState error={state.error}/>;
  const { run, declaration, config, products, openingBatches } = state.data;
  const categories = [...new Set(products.map(p => p.category))];
  const perishables = products.filter(p => p.perishable).length;
  const budgetUsed = (run.opening_inventory_cost / run.opening_inventory_budget) * 100;

  return <>
    <PageHeader eyebrow="Client acceptance supporting evidence" title="Model & setup" subtitle="The frozen assumptions, product world and opening conditions that define this simulation run."/>
    <InfoBanner tone="success"><LockKeyhole size={18}/><strong>Configuration frozen.</strong> Completed-run product data, customer assumptions and Store Brain rules have no edit or delete workflow. A changed model must be run as a new simulation.</InfoBanner>

    <div className="kpi-grid kpi-grid-4">
      <KpiCard label="Opening inventory" value={money(run.opening_inventory_cost)} detail={`${pct(budgetUsed)} of A$40,000 maximum`} icon={Boxes}/>
      <KpiCard label="Opening operating cash" value={money(run.opening_operating_cash)} detail="Available from Day 1 for replenishment" icon={WalletCards}/>
      <KpiCard label="Product catalogue" value={integer(products.length)} detail={`${perishables} perishable products`} icon={PackageSearch}/>
      <KpiCard label="Simulation horizon" value="60 days" detail={`Starts ${dateAU(run.simulated_start_date)}`} icon={CalendarDays}/>
    </div>

    <SectionCard title="Model Declaration" subtitle="Material assumptions required to understand the Submitted Run and its commercial conclusions.">
      <div className="declaration-grid">
        {Object.entries(declaration).map(([key,value]) => <article key={key} className="declaration-item"><h3>{labelize(key)}</h3><p>{value}</p></article>)}
      </div>
    </SectionCard>

    <InfoBanner><strong>Budget treatment:</strong> the A$40,000 opening-inventory figure is a maximum, not a spending target. This run uses {money(run.opening_inventory_cost)}; the unused allowance is not transferred into the A$15,000 operating-cash balance.</InfoBanner>

    <div className="two-col">
      <SectionCard title="Customer structure" subtitle="Relative mix changes between weekdays and weekends.">
        <div className="stack-list">
          {Object.entries(config.customerTypes || {}).map(([name, data]) => <div className="stack-row" key={name}>
            <div><strong>{name}</strong><small>Structured category affinities and mission probabilities</small></div>
            <div className="weight-pair"><span>Weekday {(data.weekdayWeight*100).toFixed(0)}%</span><span>Weekend {(data.weekendWeight*100).toFixed(0)}%</span></div>
          </div>)}
        </div>
      </SectionCard>
      <SectionCard title="Store Brain rules" subtitle="Rule-based autonomous control is deliberately transparent and auditable.">
        <div className="rule-list">
          <div><span>Supplier lead time</span><strong>{config.rules?.leadTimeDays} day</strong></div>
          <div><span>Expiry-warning horizon</span><strong>{config.rules?.expiryWarningDays} days</strong></div>
          <div><span>Recent-sales window</span><strong>{config.rules?.recentSalesWindowDays} days</strong></div>
          <div><span>Slow-mover evaluation begins</span><strong>Day {config.rules?.slowMovingMinimumAgeDays}</strong></div>
          <div><span>Substitution probability</span><strong>{pct((config.rules?.substitutionProbability || 0)*100,0)}</strong></div>
          <div><span>Completed history editable</span><StatusPill status="PASS">No</StatusPill></div>
        </div>
      </SectionCard>
    </div>

    <div className="two-col">
      <SectionCard title="Day-of-week demand assumptions" subtitle="Synthetic shopping-visit means plus the stored factor applied to the chance of multi-unit demand; actual visits still vary using the seeded simulation.">
        <DataTable rowKey="day" rows={Object.entries(config.dayVisitMeans || {}).map(([day,mean])=>({day,mean,multiUnitFactor:config.dayDemandFactors?.[day] ?? 1}))} columns={[
          {key:'day',label:'Day'}, {key:'mean',label:'Mean shopping visits',align:'right'}, {key:'multiUnitFactor',label:'Multi-unit factor',align:'right',render:v=>`${Number(v).toFixed(2)}×`}
        ]}/>
      </SectionCard>
      <SectionCard title="Shopping missions" subtitle="Basket size and strongest category preference are part of the frozen demand model.">
        <DataTable rowKey="mission" rows={Object.entries(config.shoppingMissions || {}).map(([mission,data])=>{
          const topCategory=Object.entries(data.categoryWeights || {}).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';
          return {mission,basket:`${data.basketMin}–${data.basketMax} items`,topCategory};
        })} columns={[
          {key:'mission',label:'Mission'}, {key:'basket',label:'Basket range'}, {key:'topCategory',label:'Strongest category weight'}
        ]}/>
      </SectionCard>
    </div>

    <SectionCard title="Product catalogue & opening inventory" subtitle="A broad small-supermarket range with purchase cost, selling price, opening quantity and perishability retained as run configuration."
      action={<div className="table-tools"><input placeholder="Search products…" value={query} onChange={e=>setQuery(e.target.value)}/><select value={category} onChange={e=>setCategory(e.target.value)}><option>All</option>{categories.map(c=><option key={c}>{c}</option>)}</select></div>}>
      <DataTable
        rowKey="product_id"
        rows={filtered}
        columns={[
          {key:'product_id',label:'ID'},
          {key:'name',label:'Product'},
          {key:'category',label:'Category'},
          {key:'purchase_cost',label:'Buy',align:'right',render:v=>money(v)},
          {key:'selling_price',label:'Sell',align:'right',render:v=>money(v)},
          {key:'initial_quantity',label:'Opening qty',align:'right'},
          {key:'perishable',label:'Perishable',render:v=>v?<span className="tag"><Snowflake size={13}/> Yes</span>:'No'},
          {key:'shelf_life_days',label:'Shelf life',align:'right',render:v=>v?`${v} d`:'—'}
        ]}
      />
    </SectionCard>

    <details className="card disclosure-card">
      <summary><span><Database size={18}/> Opening batch evidence</span><small>{openingBatches.length} immutable receipt/age records</small></summary>
      <div className="disclosure-body"><DataTable rowKey={(r,i)=>`${r.product_id}-${i}`} rows={openingBatches} columns={[
        {key:'product_id',label:'Product ID'}, {key:'batch_reference',label:'Batch'},
        {key:'quantity_received',label:'Qty',align:'right'}, {key:'unit_cost',label:'Unit cost',align:'right',render:v=>money(v)},
        {key:'expiry_day',label:'Expiry day',align:'right',render:v=>v??'Non-perishable'}
      ]}/></div>
    </details>
  </>;
}
