class EventBusService {
  constructor() {
    this.eventMap = new Map();
  }

  on(event, callback) {
    // Get or create set of callbacks for this event
    if (!this.eventMap.has(event)) {
      this.eventMap.set(event, new Set());
    }
    const callbacks = this.eventMap.get(event);

    // Create wrapper that handles detail extraction
    const wrappedCallback = (e) => {
      try {
        // Only call if callback is still registered and event is valid
        if (callbacks.has(wrappedCallback) && e && e.detail !== undefined) {
          callback(e.detail);
        }
      } catch (error) {
        console.error("Error in event callback:", error);
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
            this.eventMap.delete(event);
          }
        }
      } catch (error) {
        console.error("Error cleaning up event listener:", error);
      }
    };
  }

  dispatch(event, data) {
    // Only dispatch if there are listeners
    if (this.eventMap.has(event)) {
      document.dispatchEvent(new CustomEvent(event, { detail: data }));
    }
  }

  remove(event) {
    const callbacks = this.eventMap.get(event);
    if (callbacks) {
      // Remove all callbacks for this event
      for (const wrappedCallback of callbacks) {
        document.removeEventListener(event, wrappedCallback);
        callbacks.delete(wrappedCallback);
      }
      if (callbacks.size === 0) {
        this.eventMap.delete(event);
      }
    }
  }

  cleanup() {
    // Clean up all event listeners
    for (const [event, callbacks] of this.eventMap.entries()) {
      for (const callback of callbacks) {
        document.removeEventListener(event, callback);
      }
      callbacks.clear();
    }
    this.eventMap.clear();
  }
}

const eventBus = new EventBusService();

export default eventBus;
