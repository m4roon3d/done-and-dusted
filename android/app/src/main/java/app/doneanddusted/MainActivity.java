package app.doneanddusted;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CalendarPlugin.class); // adds tasks straight to the phone's calendar
        super.onCreate(savedInstanceState);
        // Let the opening animation play its tune before the first tap. It can be turned off in Settings.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
    }
}
