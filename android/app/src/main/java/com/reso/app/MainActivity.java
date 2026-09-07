package com.reso.app;

import com.getcapacitor.BridgeActivity;
import com.reso.app.alarm.AlarmPlugin;
import com.reso.app.screentime.ScreenTimePlugin;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(android.os.Bundle savedInstanceState) {
		registerPlugin(AlarmPlugin.class);
		registerPlugin(ScreenTimePlugin.class);
		super.onCreate(savedInstanceState);
	}
}
