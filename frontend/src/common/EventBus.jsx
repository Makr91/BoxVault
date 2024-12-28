// Map of event names to sets of callbacks
const eventMap = new Map();

const eventBus = {
  on(event, callback) {
    // Get or create set of callbacks for this event
    if (!eventMap.has(event)) {
      eventMap.set(event, new Set());
    }
    const callbacks = eventMap.get(event);

    // Create wrapper that handles detail extraction
    const wrappedCallback = (e) => {
      // Only call if callback is still registered
      if (callbacks.has(wrappedCallback)) {
        callback(e.detail);
      }
    };
    
    // Store the wrapped callback
    callbacks.add(wrappedCallback);
    
    // Add event listener
    document.addEventListener(event, wrappedCallback);

    // Return cleanup function
    return () => {
      document.removeEventListener(event, wrappedCallback);
      callbacks.delete(wrappedCallback);
      if (callbacks.size === 0) {
        eventMap.delete(event);
      }
    };
  },

  dispatch(event, data) {
    // Only dispatch if there are listeners
    if (eventMap.has(event)) {
      document.dispatchEvent(new CustomEvent(event, { detail: data }));
    }
  },

  remove(event, callback) {
    const callbacks = eventMap.get(event);
    if (callbacks) {
      // Find and remove the wrapped version of the callback
      for (const wrappedCallback of callbacks) {
        document.removeEventListener(event, wrappedCallback);
        callbacks.delete(wrappedCallback);
      }
      if (callbacks.size === 0) {
        eventMap.delete(event);
      }
    }
  }
};

export default eventBus;
