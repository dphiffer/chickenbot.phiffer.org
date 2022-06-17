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
* time: 8PM

## Add people

Add names and phone numbers for people who will be caring for the chickens. Assigning the status `active` will include a person in the rotation for a given week.

## Google auth

1. Download a Service Account JSON file from Google Cloud ([instructions](https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication))
2. Copy the `client_email` from the JSON file and share the Google Sheet document with that email address, with edit privileges

## Configuration

1. Copy `config.js.example` to `config.js`
2. Set `chickenbotPhone` as the phone number for the bot (from Twilio)
3. Set `adminPhone` as the number for the admin user (perhaps your cell number)
4. Configure the Google Sheet ID from its URL, and set the filename for the service key json file (saved in the `config` folder)
5. Configure the Twilio SID and auth token from the [Twilio Console](https://console.twilio.com/)

## Install dependencies

```
npm install
```

## Run the server

```
npm start
```

## Setup Twilio

Configure the phone number to send webhook requests to the chickenbot server.

## Schedule tasks

From the admin phone, send a `schedule` SMS to the chickenbot phone number to schedule
tasks for the coming week.
