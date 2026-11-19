package app.doneanddusted;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;

/** Bridge between the app and the widget, the share sheet and the long-press shortcuts. */
@CapacitorPlugin(name = "DDWidget")
public class WidgetPlugin extends Plugin {
    private static WidgetPlugin live;

    @Override
    public void load() { live = this; }

    /** Called by the app whenever tasks change: what the widget should show. */
    @PluginMethod
    public void update(PluginCall call) {
        try {
            JSObject d = call.getData();
            d.put("doneNow", 0);
            WidgetStore.setData(getContext(), d.toString());
            TodayWidget.renderAll(getContext());
        } catch (Exception ignored) { }
        call.resolve();
    }

    /** Everything waiting for the app: widget ticks, shared text, a shortcut that was tapped. */
    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject r = new JSObject();
        r.put("done", WidgetStore.take(getContext(), "done"));
        r.put("share", WidgetStore.take(getContext(), "share"));
        r.put("imports", WidgetStore.take(getContext(), "import"));
        JSONArray sc = WidgetStore.take(getContext(), "shortcut");
        r.put("shortcut", sc.length() > 0 ? sc.optString(sc.length() - 1) : null);
        call.resolve(r);
    }

    static void ping() { if (live != null) live.notifyListeners("pending", new JSObject()); }

    /** Note what an incoming intent asks for. Returns true if it asked for anything. */
    static boolean stash(android.content.Context c, Intent i) {
        if (i == null || i.getAction() == null) return false;
        String a = i.getAction();
        if (Intent.ACTION_SEND.equals(a) && "text/plain".equals(i.getType())) {
            String text = i.getStringExtra(Intent.EXTRA_TEXT), subj = i.getStringExtra(Intent.EXTRA_SUBJECT);
            String s = (subj != null && !subj.isEmpty() && (text == null || !text.contains(subj))) ? subj + (text != null ? " — " + text : "") : text;
            if (s != null && !s.trim().isEmpty()) { WidgetStore.push(c, "share", s.trim()); return true; }
            return false;
        }
        if (Intent.ACTION_VIEW.equals(a) && i.getData() != null) { // a shared list, opened from the browser
            android.net.Uri u = i.getData();
            String code = null;
            if ("doneanddusted".equals(u.getScheme()) && u.getPathSegments().size() > 0) code = u.getLastPathSegment();
            else if (u.getFragment() != null && u.getFragment().startsWith("share=")) code = u.getFragment().substring(6);
            if (code != null && code.matches("[zj]\\.[A-Za-z0-9_-]+")) { WidgetStore.push(c, "import", code); return true; }
            return false;
        }
        String k = a.equals("app.doneanddusted.ADD") ? "add" : a.equals("app.doneanddusted.DICTATE") ? "dictate"
            : a.equals("app.doneanddusted.PLAN") ? "plan" : a.equals("app.doneanddusted.TODAY") ? "today" : null;
        if (k == null) return false;
        WidgetStore.push(c, "shortcut", k);
        return true;
    }
}
