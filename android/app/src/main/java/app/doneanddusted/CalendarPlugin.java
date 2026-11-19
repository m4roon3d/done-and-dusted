package app.doneanddusted;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.util.TimeZone;

/**
 * Puts tasks straight into the phone's calendar (the person's main Google calendar when there is one),
 * with a 15-minute alert. No file, no share sheet. Asks for calendar access the first time.
 * An event added before is updated in place instead of added again.
 */
@CapacitorPlugin(
    name = "DDCalendar",
    permissions = { @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR }) }
)
public class CalendarPlugin extends Plugin {

    @PluginMethod
    public void addEvents(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            requestPermissionForAlias("calendar", call, "permCallback");
            return;
        }
        doAdd(call);
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) doAdd(call);
        else call.reject("denied", "denied");
    }

    private void doAdd(PluginCall call) {
        JSArray events = call.getArray("events");
        if (events == null) { call.reject("No events"); return; }
        ContentResolver cr = getContext().getContentResolver();
        long calId = pickCalendar(cr);
        if (calId < 0) { call.reject("nocalendar", "nocalendar"); return; }
        String calName = calendarName(cr, calId);
        JSArray ids = new JSArray();
        int added = 0, updated = 0;
        try {
            for (int i = 0; i < events.length(); i++) {
                JSONObject e = events.getJSONObject(i);
                long start = e.getLong("start");
                long mins = e.optLong("minutes", 15);
                String rrule = e.optString("rrule", "");
                ContentValues v = new ContentValues();
                v.put(CalendarContract.Events.CALENDAR_ID, calId);
                v.put(CalendarContract.Events.TITLE, e.optString("title", "Task"));
                v.put(CalendarContract.Events.DESCRIPTION, e.optString("description", ""));
                v.put(CalendarContract.Events.DTSTART, start);
                v.put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());
                v.put(CalendarContract.Events.HAS_ALARM, 1);
                if (!rrule.isEmpty()) {           // repeating events need a duration, not an end time
                    v.put(CalendarContract.Events.RRULE, rrule);
                    v.put(CalendarContract.Events.DURATION, "PT" + mins + "M");
                    v.putNull(CalendarContract.Events.DTEND);
                } else {
                    v.put(CalendarContract.Events.DTEND, start + mins * 60000L);
                    v.putNull(CalendarContract.Events.RRULE);
                    v.putNull(CalendarContract.Events.DURATION);
                }
                long old = e.optLong("eventId", -1);
                long id;
                if (old > 0 && exists(cr, old)) {
                    cr.update(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, old), v, null, null);
                    id = old; updated++;
                } else {
                    Uri u = cr.insert(CalendarContract.Events.CONTENT_URI, v);
                    if (u == null) { ids.put(-1); continue; }
                    id = ContentUris.parseId(u); added++;
                    ContentValues r = new ContentValues();
                    r.put(CalendarContract.Reminders.EVENT_ID, id);
                    r.put(CalendarContract.Reminders.MINUTES, 15);
                    r.put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT);
                    cr.insert(CalendarContract.Reminders.CONTENT_URI, r);
                }
                ids.put(id);
            }
        } catch (Exception ex) {
            call.reject(ex.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("ids", ids);
        ret.put("added", added);
        ret.put("updated", updated);
        ret.put("calendar", calName);
        call.resolve(ret);
    }

    /** Meetings and other events between `from` and `to` (not ours), and where our own task events stand now. */
    @PluginMethod
    public void getEvents(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) { call.reject("denied", "denied"); return; }
        long from = call.getLong("from", System.currentTimeMillis()), to = call.getLong("to", from + 7L * 86400000L);
        ContentResolver cr = getContext().getContentResolver();
        JSArray out = new JSArray(), ours = new JSArray();
        android.net.Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, from); ContentUris.appendId(b, to);
        String[] cols = { CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN, CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY, CalendarContract.Instances.DESCRIPTION, CalendarContract.Instances.AVAILABILITY,
            CalendarContract.Instances.SELF_ATTENDEE_STATUS };
        try (Cursor c = cr.query(b.build(), cols, CalendarContract.Instances.VISIBLE + "=1", null, CalendarContract.Instances.BEGIN + " ASC")) {
            while (c != null && c.moveToNext()) {
                String desc = c.getString(4);
                if (desc != null && desc.startsWith("Done & Dusted")) continue; // our own task events
                if (c.getInt(6) == CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED) continue;
                JSObject e = new JSObject();
                e.put("title", c.getString(0)); e.put("start", c.getLong(1)); e.put("end", c.getLong(2));
                e.put("allDay", c.getInt(3) == 1); e.put("busy", c.getInt(5) != CalendarContract.Events.AVAILABILITY_FREE);
                out.put(e);
                if (out.length() >= 200) break;
            }
        } catch (Exception ex) { call.reject(ex.getMessage()); return; }
        JSArray ids = call.getArray("ids");
        if (ids != null) for (int i = 0; i < ids.length(); i++) {
            long id = ids.optLong(i, -1);
            if (id <= 0) continue;
            JSObject o = new JSObject(); o.put("eventId", id);
            try (Cursor c = cr.query(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id),
                    new String[] { CalendarContract.Events.DTSTART, CalendarContract.Events.DELETED }, null, null, null)) {
                if (c != null && c.moveToFirst() && c.getInt(1) == 0) o.put("start", c.getLong(0)); else o.put("gone", true);
            } catch (Exception ex) { o.put("gone", true); }
            ours.put(o);
        }
        JSObject r = new JSObject(); r.put("events", out); r.put("ours", ours);
        call.resolve(r);
    }

    private boolean exists(ContentResolver cr, long id) {
        try (Cursor c = cr.query(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id),
                new String[] { CalendarContract.Events._ID, CalendarContract.Events.DELETED }, null, null, null)) {
            return c != null && c.moveToFirst() && c.getInt(1) == 0;
        }
    }

    /** The main writable calendar: a primary Google calendar first, then any primary one, then any writable one. */
    private long pickCalendar(ContentResolver cr) {
        String[] cols = { CalendarContract.Calendars._ID, CalendarContract.Calendars.IS_PRIMARY, CalendarContract.Calendars.ACCOUNT_TYPE };
        String where = CalendarContract.Calendars.VISIBLE + "=1 AND " + CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + ">=" + CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR;
        long best = -1; int bestScore = -1;
        try (Cursor c = cr.query(CalendarContract.Calendars.CONTENT_URI, cols, where, null, null)) {
            while (c != null && c.moveToNext()) {
                int score = (c.getInt(1) == 1 ? 2 : 0) + ("com.google".equals(c.getString(2)) ? 1 : 0);
                if (score > bestScore) { bestScore = score; best = c.getLong(0); }
            }
        }
        return best;
    }

    private String calendarName(ContentResolver cr, long id) {
        try (Cursor c = cr.query(ContentUris.withAppendedId(CalendarContract.Calendars.CONTENT_URI, id),
                new String[] { CalendarContract.Calendars.CALENDAR_DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        }
        return "your calendar";
    }
}
