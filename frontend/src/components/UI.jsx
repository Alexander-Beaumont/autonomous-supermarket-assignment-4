import { AlertTriangle, CheckCircle2, Info, LoaderCircle } from 'lucide-react';

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return <header className="page-header">
    <div>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>;
}

export function Card({ children, className = '' }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function SectionCard({ title, subtitle, children, action, className = '' }) {
  return <section className={`card section-card ${className}`}>
    <div className="section-heading">
      <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      {action && <div>{action}</div>}
    </div>
    {children}
  </section>;
}

export function KpiCard({ label, value, detail, icon:Icon, tone = 'default' }) {
  return <div className={`kpi-card tone-${tone}`}>
    <div className="kpi-top"><span>{label}</span>{Icon && <Icon size={18}/>}</div>
    <strong>{value}</strong>
    {detail && <small>{detail}</small>}
  </div>;
}

export function StatusPill({ status, children }) {
  const normalized = String(status || '').toLowerCase();
  return <span className={`status-pill status-${normalized}`}>{children || status}</span>;
}

export function SeverityPill({ severity }) {
  return <span className={`severity severity-${String(severity || 'INFO').toLowerCase()}`}>{severity}</span>;
}

export function LoadingState({ label = 'Loading stored simulation evidence…' }) {
  return <div className="state-box"><LoaderCircle className="spin" size={24}/><span>{label}</span></div>;
}

export function ErrorState({ error }) {
  return <div className="state-box error-state"><AlertTriangle size={24}/><div><strong>Unable to load this view</strong><p>{error?.message || String(error)}</p></div></div>;
}

export function InfoBanner({ children, tone='info' }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' ? AlertTriangle : Info;
  return <div className={`info-banner banner-${tone}`}><Icon size={19}/><div>{children}</div></div>;
}

export function DataTable({ columns, rows, rowKey = 'id', empty = 'No records.' }) {
  return <div className="table-wrap">
    <table>
      <thead><tr>{columns.map(col => <th key={col.key} className={col.align ? `align-${col.align}` : ''}>{col.label}</th>)}</tr></thead>
      <tbody>
        {rows?.length ? rows.map((row, index) => <tr key={typeof rowKey === 'function' ? rowKey(row,index) : row[rowKey] ?? index}>
          {columns.map(col => <td key={col.key} className={col.align ? `align-${col.align}` : ''}>{col.render ? col.render(row[col.key], row, index) : row[col.key]}</td>)}
        </tr>) : <tr><td colSpan={columns.length} className="empty-cell">{empty}</td></tr>}
      </tbody>
    </table>
  </div>;
}
