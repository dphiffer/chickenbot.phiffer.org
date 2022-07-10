# 🐔 chickenbot

*Chicken care task rotation using a Google Sheet and Twilio*

This software supports a small cohort of neighbors who share responsibility caring for a flock of chickens. It is somewhat flexible, but it does make some assumptions. There must be at least two people involved, tasks can't be more frequent than once per day, the designated backup person is assumed to understand they're the backstop for any given task.

## Google Sheet

1. Make a new Google Sheet
2. There should be 4 tabs: Upcoming, Archive, Tasks, People
3. The Upcoming and Archive sheets should each have columns: date, time, task, person, status
4. The Tasks sheet should have columns: name, question, frequency, time
5. The People sheet should have columns: name, phone, status, away

Date and time columns need to be formatted like "6/21" and "7:16 PM" for the matching logic to work.

## Add tasks

The list of tasks get assigned to all the active people involved for a given week.

* __name:__ is how the task appears in the schedule
* __question:__ gets sent in the reminder text message, i.e., `Hi [name], [question]`
* __frequency:__ how often the task happens (`1` = every day, `7` = every week)
* __time:__ when the reminder gets sent (e.g., `8:00 AM` or `sunset` to schedule 10 minutes after when the sun sets)

Example morning task:

* name: Open the door
* question: did you open the chickens’ door? Check the water? Check the food?
* frequency: 1
* time: 8:00 AM

Example evening task:

* name: Close the door
* question: did you close the chickens’ door?
* frequency: 1
* time: sunset

## Add people

Add the names and phone numbers for people who will be caring for the chickens.

* __name:__ the person's name, currently assumed to be a single word without any spaces or punctuation
* __phone:__ the person's phone number, formatting is flexible (e.g., `518-555-1212`)
* __status:__ assign `active` to include a person in the rotation for a given week (other possible values: `backup`, `inactive`)
* __away:__ a list of days the person is away, as a comma-separated list of [ISO 8601 formatted dates](https://en.wikipedia.org/wiki/ISO_8601#Calendar_dates) (e.g., `2022-06-22, 2022-07-01`)

## Google auth

1. Download a Service Account JSON file from Google Cloud ([instructions](https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication))
2. Copy the `client_email` from the JSON file and share the Google Sheet document with that email address, with edit privileges

## Configuration

1. Copy `config/config.json.example` to `config/config.json`
2. Set `url` to the public facing server URL for chickenbot.
3. Set the `timezone` and `latitude`/`longitude` coordinates (used for calculating sunset times). You can find coordinate values in the URL from [Google Maps](https://maps.google.com/).
4. Set `chickenbotPhone` as the phone number for the bot (from Twilio)
5. Configure the Google Sheet ID from its URL, and set the filename for the service key json file (saved in the `config` folder)
6. Generate a webhook shared secret at the command line with `openssl rand -hex 40` and configure that value in `webhookSecret`
7. Configure the Twilio SID and auth token from the [Twilio Console](https://console.twilio.com/)

## Install dependencies

```
npm install
```

## Run the server

```
npm start
```

## Setup Twilio webhook

Configure the phone number to send webhook requests to the chickenbot server for incoming SMS messages. The URL should include a fully qualified domain followed by `/sms`, something like `https://chickenbot.example.com/sms`.

## Setup Google webhook

1. From the Google Sheet, go to the menu Extensions → Apps Script
2. Paste the code from the file `webhook.gs`
3. Replace the `url` and `secret` variables with your own values (e.g., `https://chickenbot.example.com/update`)
4. Configure `sendWebhook` from the `Head` deployment `from Spreadsheet` to run `on edit`
5. You will need to click through a scary looking "app security warning" to grant access to your spreadsheets (advanced → open unsafe app)

## Designated backup commands

From the designated backup phone:

* Send a `schedule` SMS to the chickenbot phone number to schedule tasks for the coming week
* Send `announce: [message]` to relay a message to everyone
* Send `[name]: [message]` to relay a message to a particular person by name
