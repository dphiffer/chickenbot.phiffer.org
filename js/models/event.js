"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Event {
    constructor(sheet, data) {
        this.sheet = sheet;
        this.date = data.date;
        this.time = data.time;
        this.task = data.task;
        this.person = data.person;
        this.status = data.status;
    }
}
exports.default = Event;
//# sourceMappingURL=event.js.map