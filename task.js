class Task {

	constructor(row) {
		this.name = row.name;
		this.question = row.question;
		this.frequency = parseInt(row.frequency);
		this.time = row.time;
	}
}

module.exports = Task;
