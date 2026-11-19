package app.doneanddusted;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** Home-screen widget: today's and overdue tasks, a tick to finish one, + to add. */
public class TodayWidget extends AppWidgetProvider {
    static final String TICK = "app.doneanddusted.WIDGET_TICK";
    private static final int[] ROW = { R.id.row0, R.id.row1, R.id.row2, R.id.row3, R.id.row4 };
    private static final int[] TICKS = { R.id.tick0, R.id.tick1, R.id.tick2, R.id.tick3, R.id.tick4 };
    private static final int[] DOT = { R.id.dot0, R.id.dot1, R.id.dot2, R.id.dot3, R.id.dot4 };
    private static final int[] TITLE = { R.id.title0, R.id.title1, R.id.title2, R.id.title3, R.id.title4 };
    private static final int[] WHEN = { R.id.when0, R.id.when1, R.id.when2, R.id.when3, R.id.when4 };

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) { for (int id : ids) m.updateAppWidget(id, build(c)); }

    @Override
    public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        if (!TICK.equals(i.getAction())) return;
        String id = i.getStringExtra("id");
        if (id == null) return;
        WidgetStore.push(c, "done", id); // the app marks it done next time it runs
        try { // take it off the widget straight away
            JSONObject d = WidgetStore.data(c);
            JSONArray items = d.optJSONArray("items"), keep = new JSONArray();
            if (items != null) for (int k = 0; k < items.length(); k++) if (!id.equals(items.getJSONObject(k).optString("id"))) keep.put(items.get(k));
            d.put("items", keep);
            d.put("doneNow", d.optInt("doneNow", 0) + 1);
            WidgetStore.setData(c, d.toString());
        } catch (Exception ignored) { }
        WidgetPlugin.ping();
        renderAll(c);
    }

    static void renderAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, TodayWidget.class));
        if (ids.length == 0) return;
        RemoteViews v = build(c);
        for (int id : ids) m.updateAppWidget(id, v);
    }

    private static PendingIntent open(Context c, String action, int req) {
        Intent i = new Intent(c, MainActivity.class).setAction(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_today);
        JSONObject d = WidgetStore.data(c);
        JSONArray items = d.optJSONArray("items");
        int n = items == null ? 0 : items.length();
        v.setTextViewText(R.id.head, d.optString("head", "Today"));
        int doneNow = d.optInt("doneNow", 0);
        String sub = d.optString("sub", "Open the app once to fill this in");
        if (doneNow > 0) sub = doneNow + " ticked here · " + sub;
        v.setTextViewText(R.id.sub, sub);
        v.setOnClickPendingIntent(R.id.add, open(c, "app.doneanddusted.ADD", 1));
        v.setOnClickPendingIntent(R.id.root, open(c, "app.doneanddusted.TODAY", 2));
        for (int k = 0; k < ROW.length; k++) {
            if (k >= n) { v.setViewVisibility(ROW[k], android.view.View.GONE); continue; }
            JSONObject t = items.optJSONObject(k);
            v.setViewVisibility(ROW[k], android.view.View.VISIBLE);
            v.setTextViewText(TITLE[k], t.optString("title"));
            v.setTextViewText(WHEN[k], t.optString("when"));
            if (t.optBoolean("late")) v.setTextColor(WHEN[k], c.getColor(R.color.ddw_late));
            else v.setTextColor(WHEN[k], c.getColor(R.color.ddw_muted));
            int col;
            try { col = Color.parseColor(t.optString("color", "#E39A14")); } catch (Exception e) { col = Color.parseColor("#E39A14"); }
            v.setTextColor(DOT[k], col);
            Intent tick = new Intent(c, TodayWidget.class).setAction(TICK).putExtra("id", t.optString("id"))
                .setData(Uri.parse("dd://tick/" + Uri.encode(t.optString("id"))));
            v.setOnClickPendingIntent(TICKS[k], PendingIntent.getBroadcast(c, 100 + k, tick, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            v.setOnClickPendingIntent(ROW[k], open(c, "app.doneanddusted.TODAY", 2));
        }
        int extra = d.optInt("more", 0);
        v.setViewVisibility(R.id.more, extra > 0 ? android.view.View.VISIBLE : android.view.View.GONE);
        v.setTextViewText(R.id.more, "+" + extra + " more");
        v.setViewVisibility(R.id.empty, n == 0 ? android.view.View.VISIBLE : android.view.View.GONE);
        v.setTextViewText(R.id.empty, d.optString("empty", "Nothing due today 🎉"));
        return v;
    }
}
