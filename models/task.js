class Task {

	constructor(row, sheet) {
		this.name = row.name;
		this.question = row.question;
		this.frequency = parseInt(row.frequency);
		this.time = row.time;
		this.sheet = sheet;
	}
}

module.exports = Task;
