function sendWebhook(event) {
  let url = '<Something like https://chickenbot.example.com/update>';
  let secret = '<Shared secret from config.google.webhookSecret>';

  var sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() != 'Upcoming') {
    Logger.log('Only send updates for Upcoming tab');
    return;
  }

  let pos = event.range.getA1Notation().match(/^([A-Z]+)(\d+)$/);
  if (! pos) {
    Logger.log('Could not parse range');
    return;
  }
  let row = pos[2];

  let date = new Date(event.source.getRange(`A${row}`).getValue());
  date = Utilities.formatDate(date, "America/New_York", "M/d"); // 6/17

  let time = new Date(event.source.getRange(`B${row}`).getValue());
  time = Utilities.formatDate(time, "America/New_York", "h:mm a"); // 2:46 PM

  let data = {
    secret: secret,
    date: date,
    time: time,
    task: event.source.getRange(`C${row}`).getValue(),
    person: event.source.getRange(`D${row}`).getValue(),
    status: event.source.getRange(`E${row}`).getValue()
  };
  Logger.log(data);

  const rsp = UrlFetchApp.fetch(url, {
    method: 'POST',
    payload: data
  });
  Logger.log(rsp.getContentText());
}
