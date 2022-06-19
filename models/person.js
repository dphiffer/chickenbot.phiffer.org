class Person {

	constructor(row) {
		this.name = row.name;
		this.phone = this.normalizePhone(row.phone);
		this.status = row.status;
	}

	normalizePhone(phone) {
		phone = phone.replace(/\D/g, '');
		if (phone.substr(0, 1) != '1') {
			phone = `1${phone}`;
		}
		phone = `+${phone}`;
		return phone;
	}

	static getAffirmation() {
		let affirmations = [
			'Thank you!',
			'The chickens appreciate you so much.',
			'Excellent, thank you.',
			'You’re the best!',
			'❤️🐔❤️'
		];
		let index = Math.floor(Math.random() * affirmations.length);
		return affirmations[index];
	}

	static async currentBackup(app) {
		for (let person in app.people) {
			if (person.status == 'backup') {
				return person;
			}
		}
		// Nobody assigned yet, just pick the first person on the list
		let sheet = app.doc.sheetsByTitle['People'];
		let rows = await sheet.getRows();
		for (let row of rows) {
			row.status = 'backup';
			await row.save();
			app.people[row.name].status = 'backup';
			return app.people[row.name];
		}
	}

	async updateStatus(app, status) {
		this.status = status;
		let sheet = app.doc.sheetsByTitle['People'];
		let rows = await sheet.getRows();
		for (let row in rows) {
			if (row.name == this.name) {
				row.status = status;
				await row.save();
				return this;
			}
		}
	}
}

module.exports = Person;
