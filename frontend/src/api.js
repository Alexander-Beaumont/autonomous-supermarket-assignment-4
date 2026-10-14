const request = async (path, options = {}) => {
  const response = await fetch(path, {
    headers:{ 'Content-Type':'application/json', ...(options.headers || {}) },
    ...options
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload;
};

export const api = {
  health:() => request('/api/health'),
  runs:() => request('/api/runs'),
  submittedRun:() => request('/api/runs/submitted'),
  initializeRun:(seed) => request('/api/runs/initialize', { method:'POST', body:JSON.stringify({ seed }) }),
  runSimulation:(runId) => request(`/api/runs/${runId}/run`, { method:'POST', body:'{}' }),
  summary:(runId) => request(`/api/runs/${runId}/summary`),
  model:(runId) => request(`/api/runs/${runId}/model`),
  report:(runId) => request(`/api/runs/${runId}/report`),
  day:(runId, day) => request(`/api/runs/${runId}/days/${day}`),
  brain:(runId) => request(`/api/runs/${runId}/brain`),
  assurance:(runId) => request(`/api/runs/${runId}/assurance`),
  productAudit:(runId, productId) => request(`/api/runs/${runId}/audit/product/${encodeURIComponent(productId)}`),
  transactionAudit:(runId, code) => request(`/api/runs/${runId}/audit/transaction/${encodeURIComponent(code)}`)
};
