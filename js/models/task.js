"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Task {
    constructor(row) {
        this.lastRun = null;
        this.lastPerson = null;
        this.nextRun = null;
        this.name = row.name;
        this.question = row.question;
        this.frequency = parseInt(row.frequency);
        this.time = row.time;
    }
}
exports.default = Task;
//# sourceMappingURL=task.js.map