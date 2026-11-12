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
