"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = exports.setLogFunction = void 0;
let logFunction = console.log;
function setLogFunction(fn) {
    logFunction = fn;
}
exports.setLogFunction = setLogFunction;
function log(...input) {
    for (let item of input) {
        logFunction(item);
    }
}
exports.log = log;
//# sourceMappingURL=log.js.map