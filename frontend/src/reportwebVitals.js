let observers = [];

const reportWebVitals = onPerfEntry => {
  // Clean up any existing observers
  observers.forEach(observer => {
    if (observer && observer.disconnect) {
      observer.disconnect();
    }
  });
  observers = [];

  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      // Wrap each metric function to capture its observer
      const wrapMetric = (metricFn) => {
        return (...args) => {
          const observer = metricFn(...args);
          if (observer && observer.disconnect) {
            observers.push(observer);
          }
          return observer;
        };
      };

      wrapMetric(getCLS)(onPerfEntry);
      wrapMetric(getFID)(onPerfEntry);
      wrapMetric(getFCP)(onPerfEntry);
      wrapMetric(getLCP)(onPerfEntry);
      wrapMetric(getTTFB)(onPerfEntry);
    });
  }
};

// Clean up on module unload
window.addEventListener('unload', () => {
  observers.forEach(observer => {
    if (observer && observer.disconnect) {
      observer.disconnect();
    }
  });
  observers = [];
});

export default reportWebVitals;
