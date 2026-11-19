package app.doneanddusted;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** What the widget shows, and what it, the share sheet and shortcuts asked for while the app wasn't looking. */
final class WidgetStore {
    private static SharedPreferences sp(Context c) { return c.getSharedPreferences("dd_widget", Context.MODE_PRIVATE); }

    static JSONObject data(Context c) {
        try { return new JSONObject(sp(c).getString("data", "{}")); } catch (Exception e) { return new JSONObject(); }
    }
    static void setData(Context c, String json) { sp(c).edit().putString("data", json).apply(); }

    static synchronized void push(Context c, String key, Object value) {
        try {
            JSONArray a = new JSONArray(sp(c).getString(key, "[]"));
            a.put(value);
            sp(c).edit().putString(key, a.toString()).apply();
        } catch (Exception ignored) { }
    }
    static synchronized JSONArray take(Context c, String key) {
        JSONArray a;
        try { a = new JSONArray(sp(c).getString(key, "[]")); } catch (Exception e) { a = new JSONArray(); }
        sp(c).edit().remove(key).apply();
        return a;
    }
}
