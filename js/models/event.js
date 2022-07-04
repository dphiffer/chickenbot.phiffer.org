"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Event {
    constructor(sheet, row) {
        this.sheet = sheet;
        this.date = row.date;
        this.time = row.time;
        this.task = row.task;
        this.person = row.person;
        this.status = row.status;
    }
}
exports.default = Event;
