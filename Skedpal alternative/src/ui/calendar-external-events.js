export function buildExternalEventMeta(dataset) {
  if (!dataset) {return null;}
  const start = new Date(dataset.eventStart || "");
  const end = new Date(dataset.eventEnd || "");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {return null;}
  const eventId = dataset.eventExternalId || "";
  const calendarId = dataset.eventCalendarId || "";
  if (!eventId || !calendarId) {return null;}
  return {
    source: "external",
    eventId,
    calendarId,
    start,
    end
  };
}

export function getUpdatedExternalEvents(events, payload) {
  return (events || []).map((event) => {
    if (event.id === payload.eventId && event.calendarId === payload.calendarId) {
      return {
        ...event,
        start: payload.start,
        end: payload.end
      };
    }
    return event;
  });
}

export async function sendExternalUpdateRequest(runtime, payload) {
  if (!runtime?.sendMessage) {
    throw new Error("Chrome runtime unavailable for calendar update.");
  }
  const message = {
    type: "calendar-update-event",
    calendarId: payload.calendarId,
    eventId: payload.eventId,
    start: payload.start.toISOString(),
    end: payload.end.toISOString()
  };
  if (Object.prototype.hasOwnProperty.call(payload || {}, "title")) {
    message.title = payload.title || "";
  }
  return new Promise((resolve, reject) => {
    runtime.sendMessage(message, (resp) => {
      if (runtime.lastError) {
        reject(new Error(runtime.lastError.message));
      } else {
        resolve(resp);
      }
    });
  });
}

export async function sendExternalDeleteRequest(runtime, payload) {
  if (!runtime?.sendMessage) {
    throw new Error("Chrome runtime unavailable for calendar deletion.");
  }
  return new Promise((resolve, reject) => {
    runtime.sendMessage(
      {
        type: "calendar-delete-event",
        calendarId: payload.calendarId,
        eventId: payload.eventId
      },
      (resp) => {
        if (runtime.lastError) {
          reject(new Error(runtime.lastError.message));
        } else {
          resolve(resp);
        }
      }
    );
  });
}

export async function sendExternalCreateRequest(runtime, payload) {
  if (!runtime?.sendMessage) {
    throw new Error("Chrome runtime unavailable for calendar creation.");
  }
  return new Promise((resolve, reject) => {
    runtime.sendMessage(
      {
        type: "calendar-create-event",
        calendarId: payload.calendarId,
        title: payload.title || "",
        start: payload.start.toISOString(),
        end: payload.end.toISOString()
      },
      (resp) => {
        if (runtime.lastError) {
          reject(new Error(runtime.lastError.message));
        } else {
          resolve(resp);
        }
      }
    );
  });
}
