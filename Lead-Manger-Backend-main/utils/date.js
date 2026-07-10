import moment from "moment-timezone";

export const getDayRange = (tz = process.env.APP_TIMEZONE || "Asia/Kolkata", date = new Date()) => {
  const m = moment(date).tz(tz);
  const start = m.clone().startOf("day").toDate();
  const end = m.clone().endOf("day").toDate();
  return { start, end };
};

export const parseDate = (s) => (s ? new Date(s) : null);
