// Indian public holidays and festivals. g = gazetted (central government offices closed), r = restricted/optional.
// Sources: DoPT holiday lists for 2026 (gazetted + restricted) and 2027 (gazetted), via india-briefing.com and staffnews.in.
// Kannada Rajyotsava and Ambedkar Jayanti are fixed-date state/bank holidays.
const H = {
  "2026-01-01": ["New Year", "r"], "2026-01-14": ["Makar Sankranti · Pongal", "r"], "2026-01-23": ["Vasant Panchami", "r"],
  "2026-01-26": ["Republic Day", "g"], "2026-02-15": ["Maha Shivaratri", "r"], "2026-03-03": ["Holika Dahan", "r"],
  "2026-03-04": ["Holi", "g"], "2026-03-19": ["Ugadi · Gudi Padwa", "r"], "2026-03-21": ["Id-ul-Fitr", "g"],
  "2026-03-26": ["Ram Navami", "g"], "2026-03-31": ["Mahavir Jayanti", "g"], "2026-04-03": ["Good Friday", "g"],
  "2026-04-05": ["Easter", "r"], "2026-04-14": ["Ambedkar Jayanti · Vaisakhi", "r"], "2026-05-01": ["Buddha Purnima", "g"],
  "2026-05-27": ["Bakrid", "g"], "2026-06-26": ["Muharram", "g"], "2026-07-16": ["Rath Yatra", "r"],
  "2026-08-15": ["Independence Day", "g"], "2026-08-26": ["Milad-un-Nabi · Onam", "g"], "2026-08-28": ["Raksha Bandhan", "r"],
  "2026-09-04": ["Janmashtami", "g"], "2026-09-14": ["Ganesh Chaturthi", "r"], "2026-10-02": ["Gandhi Jayanti", "g"],
  "2026-10-19": ["Durga Ashtami", "r"], "2026-10-20": ["Dussehra", "g"], "2026-10-29": ["Karva Chauth", "r"],
  "2026-11-01": ["Kannada Rajyotsava", "r"], "2026-11-08": ["Diwali", "g"], "2026-11-09": ["Govardhan Puja", "r"],
  "2026-11-11": ["Bhai Dooj", "r"], "2026-11-24": ["Guru Nanak Jayanti", "g"], "2026-12-24": ["Christmas Eve", "r"],
  "2026-12-25": ["Christmas", "g"],
  "2027-01-26": ["Republic Day", "g"], "2027-03-10": ["Id-ul-Fitr", "g"], "2027-03-23": ["Holi", "g"],
  "2027-03-26": ["Good Friday", "g"], "2027-04-14": ["Ambedkar Jayanti", "r"], "2027-04-15": ["Ram Navami", "g"],
  "2027-04-19": ["Mahavir Jayanti", "g"], "2027-05-17": ["Bakrid", "g"], "2027-05-20": ["Buddha Purnima", "g"],
  "2027-06-16": ["Muharram", "g"], "2027-08-15": ["Independence Day · Milad-un-Nabi", "g"], "2027-08-25": ["Janmashtami", "g"],
  "2027-10-02": ["Gandhi Jayanti", "g"], "2027-10-09": ["Dussehra", "g"], "2027-10-29": ["Diwali", "g"],
  "2027-11-01": ["Kannada Rajyotsava", "r"], "2027-11-14": ["Guru Nanak Jayanti", "g"], "2027-12-25": ["Christmas", "g"],
};
const key = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/* { name, off } for the day containing `ms`, or null. off = a gazetted holiday (offices and banks closed). */
export function holidayOn(ms) { const h = H[key(ms)]; return h ? { name: h[0], off: h[1] === "g" } : null; }
