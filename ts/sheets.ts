import { GoogleSpreadsheet } from 'google-spreadsheet';
import { SheetsConfig } from './types';
import { readFileSync } from 'fs';
import Person from './models/person';

class Sheets {

    private static instance: Sheets;
    people: Person[] = [];

    doc: GoogleSpreadsheet;
    webhookSecret: string;

    private constructor(config: SheetsConfig) {
        this.doc = new GoogleSpreadsheet(config.spreadsheetId);
        this.webhookSecret = config.webhookSecret;
    }

    static async init(config: SheetsConfig) {
        if (this.instance) {
            return this.instance;
        }
        this.instance = new Sheets(config);
        let credsJson = readFileSync(config.credentials, 'utf-8');
        let creds = JSON.parse(credsJson);
        await this.instance.doc.useServiceAccountAuth(creds);
	    await this.instance.doc.loadInfo();
        console.log(`Initialized ${this.instance.doc.title}`);
        this.instance.setupPeople();
        return this.instance;
    }

    async currentBackup() {
		for (let person of this.people) {
			if (person.status == 'backup') {
				return person;
			}
		}
		// Nobody assigned yet, just pick the first person on the list
		let sheet = this.doc.sheetsByTitle['People'];
		let rows = await sheet.getRows();
		for (let row of rows) {
			row.status = 'backup';
			await row.save();
			this.people[row.name].status = 'backup';
			return this.people[row.name];
		}
	}

    async setupPeople() {
        let sheet = this.doc.sheetsByTitle['People'];
        let rows = await sheet.getRows();
        for (let row of rows) {
            this.people.push(new Person(this, row));
        }
    }
    
}

export default Sheets;