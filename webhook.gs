const properties = PropertiesService.getScriptProperties();
const config = properties.getProperties();

function handleUpdate(event) {
  Logger.log('handleUpdate');
  try {
    let sheet = SpreadsheetApp.getActiveSheet();
    if (sheet.getName() == 'Upcoming') {
      sendUpdate('assignment', upcomingUpdate(event));
    } else if (sheet.getName() == 'People') {
      sendUpdate('person', peopleUpdate(event));
    } else {
      Logger.log(`Ignoring update to ${sheet.getName()} sheet`);
    }
  } catch (err) {
    Logger.log(err);
  }
}

function sendUpdate(type, data) {
  if (!type || !data) {
    return;
  }
  let payload = {
    secret: config.secret
  };
  payload[type] = data;

  Logger.log(payload);
  const rsp = UrlFetchApp.fetch(config.url, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });
  Logger.log(rsp.getContentText());
}

function upcomingUpdate(event) {
  let row = getRowNum(event);
  let date = new Date(event.source.getRange(`A${row}`).getValue());
  date = Utilities.formatDate(date, config.timezone, "M/d"); // 6/17
  let time = new Date(event.source.getRange(`B${row}`).getValue());
  time = Utilities.formatDate(time, config.timezone, "h:mm a"); // 2:46 PM
  return {
    date: date,
    time: time,
    task: event.source.getRange(`C${row}`).getValue(),
    person: event.source.getRange(`D${row}`).getValue(),
    status: event.source.getRange(`E${row}`).getValue()
  };
}

function peopleUpdate(event) {
  let row = getRowNum(event);
  return {
    name: event.source.getRange(`A${row}`).getValue(),
    phone: event.source.getRange(`B${row}`).getValue(),
    status: event.source.getRange(`C${row}`).getValue(),
    away: event.source.getRange(`D${row}`).getValue()
  };
}

function getRowNum(event) {
  let pos = event.range.getA1Notation().match(/^([A-Z]+)(\d+)$/);
  if (!pos) {
    Logger.log('Could not parse range');
    return;
  }
  return pos[2];
}
