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
}

module.exports = Person;
