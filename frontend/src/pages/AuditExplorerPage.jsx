import { useEffect, useMemo, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api.js';
import { integer, money } from '../format.js';
import { ErrorState, InfoBanner, LoadingState, PageHeader, SectionCard, SeverityPill } from '../components/UI.jsx';

export default function AuditExplorerPage() {
  const { runId } = useOutletContext();
  const location = useLocation();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const requestedProduct = query.get('product') || '';
  const requestedTransaction = query.get('transaction') || '';
  const modelState = useApiDataCompat(() => api.model(runId), [runId]);
  const [productId,setProductId]=useState('');
  const [productAudit,setProductAudit]=useState(null);
  const [productError,setProductError]=useState(null);
  const [txCode,setTxCode]=useState(requestedTransaction);
  const [txAudit,setTxAudit]=useState(null);
  const [txError,setTxError]=useState(null);

  useEffect(()=>{
    if (!modelState.data?.products?.length) return;
    const requested = modelState.data.products.find(p => p.product_id === requestedProduct)?.product_id;
    setProductId(requested || modelState.data.products[0].product_id);
  },[modelState.data, requestedProduct]);
  useEffect(()=>{
    if (!productId) return;
    let active=true; setProductError(null);
    api.productAudit(runId,productId).then(v=>active&&setProductAudit(v)).catch(e=>active&&setProductError(e));
    return()=>{active=false};
  },[runId,productId]);

  useEffect(()=>{
    if (!requestedTransaction) return;
    let active=true; setTxCode(requestedTransaction); setTxError(null); setTxAudit(null);
    api.transactionAudit(runId,requestedTransaction).then(v=>active&&setTxAudit(v)).catch(e=>active&&setTxError(e));
    return()=>{active=false};
  },[runId,requestedTransaction]);

  const stockSeries=useMemo(()=>productAudit?.ledger.map((m,i)=>({seq:i+1,day:m.day_number,balance:m.balance_after,type:m.movement_type}))||[],[productAudit]);

  async function lookupTransaction(e){
    e.preventDefault(); setTxError(null); setTxAudit(null);
    if(!txCode.trim()) return;
    try{setTxAudit(await api.transactionAudit(runId,txCode.trim()));}catch(err){setTxError(err)}
  }

  if(modelState.loading) return <LoadingState/>;
  if(modelState.error) return <ErrorState error={modelState.error}/>;
  return <>
    <PageHeader eyebrow="Traceability" title="Audit Explorer" subtitle="Follow a product or transaction directly into the stored evidence that supports the 60-day report."/>
    <InfoBanner><strong>Why this exists:</strong> the client may audit any reported figure, day, product, transaction, inventory movement or Store Brain action. This view makes that path explicit without editing historical records.</InfoBanner>

    <SectionCard title="Product ledger" subtitle="Opening stock, receipts, sales and write-offs in append order."
      action={<select value={productId} onChange={e=>setProductId(e.target.value)}>{modelState.data.products.map(p=><option key={p.product_id} value={p.product_id}>{p.product_id} · {p.name}</option>)}</select>}>
      {productError ? <ErrorState error={productError}/> : !productAudit ? <LoadingState label="Loading product ledger…"/> : <>
        <div className="audit-product-head"><div><span>{productAudit.product.product_id}</span><h3>{productAudit.product.name}</h3><p>{productAudit.product.category}</p></div><div><span>Opening quantity <strong>{integer(productAudit.product.initial_quantity)}</strong></span><span>Buy / sell <strong>{money(productAudit.product.purchase_cost)} / {money(productAudit.product.selling_price)}</strong></span></div></div>
        <div className="chart-medium"><ResponsiveContainer width="100%" height="100%"><LineChart data={stockSeries}><XAxis dataKey="seq" tick={false}/><YAxis/><Tooltip labelFormatter={(_,payload)=>payload?.[0]?.payload?`Day ${payload[0].payload.day} · ${payload[0].payload.type}`:''}/><Line type="stepAfter" dataKey="balance" stroke="var(--chart-primary)" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div>
        <div className="table-wrap"><table><thead><tr><th>Day</th><th>Movement</th><th>Reference</th><th>Batch</th><th className="align-right">Qty</th><th className="align-right">Δ</th><th className="align-right">Balance</th></tr></thead><tbody>{productAudit.ledger.map(m=><tr key={m.id}><td>{m.day_number}</td><td>{m.movement_type.replaceAll('_',' ')}</td><td>{m.reference_id||'—'}</td><td>{m.batch_reference||'—'}</td><td className="align-right">{m.quantity}</td><td className="align-right">{m.quantity_delta>0?'+':''}{m.quantity_delta}</td><td className="align-right"><strong>{m.balance_after}</strong></td></tr>)}</tbody></table></div>
        {productAudit.brainEvents.length>0&&<details className="inline-disclosure"><summary>Store Brain events for this product ({productAudit.brainEvents.length})</summary><div className="mini-timeline">{productAudit.brainEvents.map((e,i)=><div key={i}><span>Day {e.day_number}</span><SeverityPill severity={e.severity}/><strong>{e.event_type.replaceAll('_',' ')}</strong><p>{e.condition_text}</p></div>)}</div></details>}
      </>}
    </SectionCard>

    <SectionCard title="Transaction trace" subtitle="Enter any transaction code from a Daily Report to verify line revenue, COGS, inventory decrements and the cash receipt.">
      <form className="transaction-search" onSubmit={lookupTransaction}><Search size={18}/><input value={txCode} onChange={e=>setTxCode(e.target.value)} placeholder="Example: TX-23-03002"/><button className="button primary" type="submit">Trace transaction</button></form>
      {txError&&<ErrorState error={txError}/>} 
      {txAudit&&<div className="tx-audit-result"><div className="audit-product-head"><div><span>Stored transaction</span><h3>{txAudit.transaction.transaction_code}</h3><p>{txAudit.transaction.customer_code} · Day {txAudit.transaction.day_number}</p></div><div><span>Total <strong>{money(txAudit.transaction.total)}</strong></span><span>Gross profit <strong>{money(txAudit.transaction.gross_profit)}</strong></span></div></div>
        <div className="table-wrap"><table><thead><tr><th>Product</th><th className="align-right">Qty</th><th className="align-right">Sell price</th><th className="align-right">Revenue</th><th className="align-right">COGS</th></tr></thead><tbody>{txAudit.items.map(i=><tr key={i.id}><td>{i.product_name}</td><td className="align-right">{i.quantity}</td><td className="align-right">{money(i.unit_sell_price)}</td><td className="align-right">{money(i.line_revenue)}</td><td className="align-right">{money(i.line_cogs)}</td></tr>)}</tbody></table></div>
        <div className="trace-grid"><div><strong>{txAudit.inventoryMovements.length}</strong><span>inventory movement record(s)</span></div><div><strong>{txAudit.cashMovements.length}</strong><span>cash receipt record(s)</span></div><div><strong>{money(txAudit.cashMovements[0]?.amount||0)}</strong><span>recorded cash increase</span></div></div>
      </div>}
    </SectionCard>
  </>;
}

function useApiDataCompat(loader,deps){
  const [state,setState]=useState({loading:true,data:null,error:null});
  useEffect(()=>{let active=true;setState({loading:true,data:null,error:null});loader().then(data=>active&&setState({loading:false,data,error:null})).catch(error=>active&&setState({loading:false,data:null,error}));return()=>{active=false};},deps); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
