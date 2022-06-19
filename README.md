# chickenbot

Chicken care task rotation using a Google Sheet and Twilio

## Google Sheet

1. Make a new Google Sheet
2. There should be 4 tabs: Upcoming, Archive, Tasks, People
3. The Upcoming and Archive sheets should each have columns: date, time, task, person, status
4. The Tasks sheet should have columns: name, question, frequency, time
5. The People sheet should have columns: name, phone, status

## Add tasks

Example task:

* name: Close the door
* question: did you close the chickens’ door?
* frequency: 1
* time: 8:00 PM

## Add people

Add names and phone numbers for people who will be caring for the chickens. Assigning the status `active` will include a person in the rotation for a given week.

Names are currently assumed to be a single word, a first name without any spaces or punctuation.

## Google auth

1. Download a Service Account JSON file from Google Cloud ([instructions](https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication))
2. Copy the `client_email` from the JSON file and share the Google Sheet document with that email address, with edit privileges

## Configuration

1. Copy `config.js.example` to `config.js`
2. Set `url` to the public facing server URL for chickenbot.
3. Set `chickenbotPhone` as the phone number for the bot (from Twilio)
4. Configure the Google Sheet ID from its URL, and set the filename for the service key json file (saved in the `config` folder)
5. Generate a webhook shared secret at the command line with `openssl rand -hex 40` and configure that value in `webhookSecret`
6. Configure the Twilio SID and auth token from the [Twilio Console](https://console.twilio.com/)

## Install dependencies

```
npm install
```

## Run the server

```
npm start
```

## Setup Twilio webhook

Configure the phone number to send webhook requests to the chickenbot server for incoming SMS messages. The URL should be something like `https://chickenbot.example.com/message`.

## Setup Google webhook

1. From the Google Sheet, go to the menu Extensions > Apps Script
2. Paste the code from the file `webhook.gs`
3. Replace the `url` and `secret` variables with your own values
4. Configure `sendWebhook` from the `Head` deployment `from Spreadsheet` to run `on edit`
5. You will need to click through a scary looking "app security warning" to grant access to your spreadsheets (advanced -> open unsafe app)

## Designated backup commands

From the designated backup phone:

* Send a `schedule` SMS to the chickenbot phone number to schedule tasks for the coming week
* Send `announce: [message]` to relay a message to everyone
* Send `[name]: [message]` to relay a message to a particular person by name
* Send `backup: [name]` to assign the backup role to another person
