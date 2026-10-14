import { useEffect, useState } from 'react';

export function useApiData(loader, deps = []) {
  const [state, setState] = useState({ loading:true, data:null, error:null });
  useEffect(() => {
    let active = true;
    setState({ loading:true, data:null, error:null });
    Promise.resolve().then(loader).then(data => {
      if (active) setState({ loading:false, data, error:null });
    }).catch(error => {
      if (active) setState({ loading:false, data:null, error });
    });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
