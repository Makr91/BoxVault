import { useCallback, useState } from 'react';

export const useNotice = () => {
  const [notice, setNotice] = useState(null);
  const notify = useCallback((type, text) => setNotice(text ? { type, text } : null), []);
  const node = notice ? (
    <div className={`alert alert-${notice.type}`} role="alert">
      {notice.text}
    </div>
  ) : null;
  return [node, notify];
};
