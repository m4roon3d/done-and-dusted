package app.doneanddusted;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CalendarPlugin.class); // adds tasks straight to the phone's calendar
        registerPlugin(WidgetPlugin.class);   // home-screen widget, share-to-app and shortcuts
        if (savedInstanceState == null) WidgetPlugin.stash(this, getIntent()); // opened from the share sheet, a shortcut or the widget (not again on a rebuild)
        super.onCreate(savedInstanceState);
        if (getBridge() == null || getBridge().getWebView() == null) return;
        // Let the opening animation play its tune before the first tap. It can be turned off in Settings.
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);

        // When the phone runs short of memory it can kill the WebView's renderer while the app sits in the
        // background. If nobody handles that, Android kills the whole app, and many phones then drop it from
        // Recents. Instead, throw away the dead WebView and rebuild the screen; tasks are stored on the device,
        // so nothing is lost.
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                Log.w("DoneAndDusted", "WebView renderer gone (crashed: " + detail.didCrash() + "), reloading");
                try {
                    if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
                    view.destroy();
                } catch (Exception ignored) { }
                if (!isFinishing()) recreate();
                return true; // handled: keep the app alive
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (WidgetPlugin.stash(this, intent)) WidgetPlugin.ping(); // already open: tell the app now
    }
}
