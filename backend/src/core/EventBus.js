const EventEmitter = require("events");

class EventBus {
    constructor() {
        this.emitter = new EventEmitter();

        // Prevent listener warning
        this.emitter.setMaxListeners(100);
    }

    subscribe(event, listener) {
        this.emitter.on(event, listener);
    }

    subscribeOnce(event, listener) {
        this.emitter.once(event, listener);
    }

    unsubscribe(event, listener) {
        this.emitter.off(event, listener);
    }

    publish(event, payload = {}) {

        const log = {
            event,
            jobId: payload.jobId,
            time: new Date().toISOString()
        };

        console.log(log);

        this.emitter.emit(event, payload);

    }
}

module.exports = new EventBus();