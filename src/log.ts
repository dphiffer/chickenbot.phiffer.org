let logFunction: Function = console.log;

export function setLogFunction(fn: Function) {
	logFunction = fn;
}

export function log(...input: any[]) {
	for (let item of input) {
		logFunction(item);
	}
}
