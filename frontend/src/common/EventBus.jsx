const listeners = new Map();

const eventBus = {
  on(event, callback) {
    // Create wrapper that handles detail extraction
    const wrappedCallback = (e) => callback(e.detail);
    
    // Store both the original and wrapped callback
    listeners.set(callback, wrappedCallback);
    
    document.addEventListener(event, wrappedCallback);
  },
  dispatch(event, data) {
    document.dispatchEvent(new CustomEvent(event, { detail: data }));
  },
  remove(event, callback) {
    // Get the wrapped version of the callback
    const wrappedCallback = listeners.get(callback);
    if (wrappedCallback) {
      document.removeEventListener(event, wrappedCallback);
      listeners.delete(callback);
    }
  },
};

export default eventBus;
