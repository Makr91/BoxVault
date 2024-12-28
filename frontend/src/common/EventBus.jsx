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
      try {
        // Only call if callback is still registered and event is valid
        if (callbacks.has(wrappedCallback) && e && e.detail !== undefined) {
          callback(e.detail);
        }
      } catch (error) {
        console.error('Error in event callback:', error);
      }
    };
    
    // Store the wrapped callback
    callbacks.add(wrappedCallback);
    
    // Add event listener
    document.addEventListener(event, wrappedCallback);

    // Return cleanup function
    return () => {
      try {
        document.removeEventListener(event, wrappedCallback);
        if (callbacks.has(wrappedCallback)) {
          callbacks.delete(wrappedCallback);
          if (callbacks.size === 0) {
            eventMap.delete(event);
          }
        }
      } catch (error) {
        console.error('Error cleaning up event listener:', error);
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
