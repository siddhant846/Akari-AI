package com.akari.ai;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.AlarmClock;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.widget.Toast;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MainActivity extends BridgeActivity {

    public class AndroidBridge {
        private final Context context;
        private boolean isTorchOn = false;

        public AndroidBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public boolean openApp(String appNameOrPackage) {
            if (appNameOrPackage == null || appNameOrPackage.trim().isEmpty()) return false;
            final String raw = appNameOrPackage.trim();
            final String query = raw.toLowerCase();

            // 1. Direct system intent shortcuts
            try {
                if (query.equals("camera")) {
                    Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (intent.resolveActivity(context.getPackageManager()) != null) {
                        context.startActivity(intent);
                        return true;
                    }
                } else if (query.equals("settings")) {
                    Intent intent = new Intent(Settings.ACTION_SETTINGS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(intent);
                    return true;
                } else if (query.equals("dialer") || query.equals("phone") || query.equals("call")) {
                    Intent intent = new Intent(Intent.ACTION_DIAL);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(intent);
                    return true;
                } else if (query.equals("contacts")) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, ContactsContract.Contacts.CONTENT_URI);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(intent);
                    return true;
                } else if (query.equals("calculator")) {
                    Intent intent = new Intent(Intent.ACTION_MAIN);
                    intent.addCategory(Intent.CATEGORY_APP_CALCULATOR);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (intent.resolveActivity(context.getPackageManager()) != null) {
                        context.startActivity(intent);
                        return true;
                    }
                } else if (query.equals("alarm") || query.equals("clock")) {
                    Intent intent = new Intent(AlarmClock.ACTION_SHOW_ALARMS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (intent.resolveActivity(context.getPackageManager()) != null) {
                        context.startActivity(intent);
                        return true;
                    }
                }
            } catch (Exception ignored) {}

            // 2. Comprehensive package alias mapping (checking candidate packages in order)
            Map<String, String[]> aliasMap = new HashMap<>();
            aliasMap.put("whatsapp", new String[]{"com.whatsapp", "com.whatsapp.w4b", "com.gbwhatsapp"});
            aliasMap.put("whatsaap", new String[]{"com.whatsapp", "com.whatsapp.w4b"});
            aliasMap.put("whats app", new String[]{"com.whatsapp", "com.whatsapp.w4b"});
            aliasMap.put("wa", new String[]{"com.whatsapp", "com.whatsapp.w4b"});
            aliasMap.put("whatsapp business", new String[]{"com.whatsapp.w4b", "com.whatsapp"});
            aliasMap.put("youtube", new String[]{"com.google.android.youtube"});
            aliasMap.put("yt", new String[]{"com.google.android.youtube"});
            aliasMap.put("youtube music", new String[]{"com.google.android.apps.youtube.music"});
            aliasMap.put("yt music", new String[]{"com.google.android.apps.youtube.music"});
            aliasMap.put("spotify", new String[]{"com.spotify.music", "com.spotify.lite"});
            aliasMap.put("instagram", new String[]{"com.instagram.android", "com.instagram.lite"});
            aliasMap.put("insta", new String[]{"com.instagram.android"});
            aliasMap.put("telegram", new String[]{"org.telegram.messenger", "org.telegram.messenger.web", "org.thunderdog.challegram"});
            aliasMap.put("tg", new String[]{"org.telegram.messenger"});
            aliasMap.put("netflix", new String[]{"com.netflix.mediaclient", "com.netflix.ninja"});
            aliasMap.put("chrome", new String[]{"com.android.chrome", "com.chrome.beta"});
            aliasMap.put("browser", new String[]{"com.android.chrome", "org.mozilla.firefox"});
            aliasMap.put("firefox", new String[]{"org.mozilla.firefox"});
            aliasMap.put("gmail", new String[]{"com.google.android.gm"});
            aliasMap.put("email", new String[]{"com.google.android.gm"});
            aliasMap.put("maps", new String[]{"com.google.android.apps.maps"});
            aliasMap.put("google maps", new String[]{"com.google.android.apps.maps"});
            aliasMap.put("photos", new String[]{"com.google.android.apps.photos", "com.sec.android.gallery3d", "com.miui.gallery"});
            aliasMap.put("gallery", new String[]{"com.google.android.apps.photos", "com.sec.android.gallery3d", "com.miui.gallery"});
            aliasMap.put("drive", new String[]{"com.google.android.apps.docs"});
            aliasMap.put("google drive", new String[]{"com.google.android.apps.docs"});
            aliasMap.put("twitter", new String[]{"com.twitter.android", "com.twitter.android.lite"});
            aliasMap.put("x", new String[]{"com.twitter.android"});
            aliasMap.put("discord", new String[]{"com.discord"});
            aliasMap.put("reddit", new String[]{"com.reddit.frontpage"});
            aliasMap.put("snapchat", new String[]{"com.snapchat.android"});
            aliasMap.put("facebook", new String[]{"com.facebook.katana", "com.facebook.lite"});
            aliasMap.put("fb", new String[]{"com.facebook.katana"});
            aliasMap.put("messenger", new String[]{"com.facebook.orca", "com.facebook.mlite"});
            aliasMap.put("amazon", new String[]{"in.amazon.mShop.android.shopping", "com.amazon.mShop.android.shopping"});
            aliasMap.put("flipkart", new String[]{"com.flipkart.android"});
            aliasMap.put("paytm", new String[]{"net.one97.paytm"});
            aliasMap.put("phonepe", new String[]{"com.phonepe.app"});
            aliasMap.put("gpay", new String[]{"com.google.android.apps.nbu.paisa.user", "com.google.android.apps.walletnfcrel"});
            aliasMap.put("google pay", new String[]{"com.google.android.apps.nbu.paisa.user", "com.google.android.apps.walletnfcrel"});
            aliasMap.put("uber", new String[]{"com.ubercab"});
            aliasMap.put("ola", new String[]{"com.olacabs.customer"});
            aliasMap.put("swiggy", new String[]{"in.swiggy.android"});
            aliasMap.put("zomato", new String[]{"com.application.zomato"});
            aliasMap.put("playstore", new String[]{"com.android.vending"});
            aliasMap.put("play store", new String[]{"com.android.vending"});
            aliasMap.put("vlc", new String[]{"org.videolan.vlc"});
            aliasMap.put("calculator", new String[]{"com.google.android.calculator", "com.sec.android.app.popupcalculator", "com.miui.calculator"});
            aliasMap.put("clock", new String[]{"com.google.android.deskclock", "com.sec.android.app.clockpackage"});

            PackageManager pm = context.getPackageManager();

            // Check if known alias matches
            if (aliasMap.containsKey(query)) {
                for (String candidatePkg : aliasMap.get(query)) {
                    try {
                        Intent launchIntent = pm.getLaunchIntentForPackage(candidatePkg);
                        if (launchIntent != null) {
                            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            context.startActivity(launchIntent);
                            return true;
                        }
                    } catch (Exception ignored) {}
                }
            }

            // If raw input looks like an explicit package name (contains dot)
            if (raw.contains(".")) {
                try {
                    Intent launchIntent = pm.getLaunchIntentForPackage(raw);
                    if (launchIntent != null) {
                        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        context.startActivity(launchIntent);
                        return true;
                    }
                } catch (Exception ignored) {}
            }

            // 3. Dynamic launcher search across all installed applications on the device
            try {
                Intent launcherIntent = new Intent(Intent.ACTION_MAIN, null);
                launcherIntent.addCategory(Intent.CATEGORY_LAUNCHER);
                List<ResolveInfo> allApps = pm.queryIntentActivities(launcherIntent, 0);

                ResolveInfo bestMatch = null;

                // Pass A: Exact label or exact package match
                for (ResolveInfo info : allApps) {
                    CharSequence labelSeq = info.loadLabel(pm);
                    if (labelSeq != null) {
                        String label = labelSeq.toString().trim().toLowerCase();
                        if (label.equals(query) || (info.activityInfo != null && info.activityInfo.packageName.equalsIgnoreCase(raw))) {
                            bestMatch = info;
                            break;
                        }
                    }
                }

                // Pass B: Contains match / word boundary match
                if (bestMatch == null) {
                    for (ResolveInfo info : allApps) {
                        CharSequence labelSeq = info.loadLabel(pm);
                        if (labelSeq != null) {
                            String label = labelSeq.toString().trim().toLowerCase();
                            if (label.contains(query) || query.contains(label)) {
                                bestMatch = info;
                                break;
                            }
                        }
                    }
                }

                // Pass C: Package name substring match
                if (bestMatch == null) {
                    for (ResolveInfo info : allApps) {
                        if (info.activityInfo != null && info.activityInfo.packageName.toLowerCase().contains(query)) {
                            bestMatch = info;
                            break;
                        }
                    }
                }

                if (bestMatch != null && bestMatch.activityInfo != null) {
                    ComponentName component = new ComponentName(
                        bestMatch.activityInfo.packageName,
                        bestMatch.activityInfo.name
                    );
                    Intent intent = new Intent(Intent.ACTION_MAIN);
                    intent.addCategory(Intent.CATEGORY_LAUNCHER);
                    intent.setComponent(component);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(intent);
                    return true;
                }
            } catch (Exception e) {
                e.printStackTrace();
            }

            // 4. WhatsApp specific intent fallback
            if (query.contains("whatsapp") || query.contains("whatsaap") || query.equals("wa")) {
                try {
                    Intent waIntent = new Intent(Intent.ACTION_VIEW);
                    waIntent.setData(Uri.parse("whatsapp://send"));
                    waIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (waIntent.resolveActivity(pm) != null) {
                        context.startActivity(waIntent);
                        return true;
                    }
                } catch (Exception ignored) {}
            }

            // 5. YouTube specific intent fallback
            if (query.contains("youtube") || query.equals("yt")) {
                try {
                    Intent ytIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("vnd.youtube:"));
                    ytIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (ytIntent.resolveActivity(pm) != null) {
                        context.startActivity(ytIntent);
                        return true;
                    }
                } catch (Exception ignored) {}
            }

            // 6. Never open Play Store automatically when the user wanted to OPEN an app!
            showToast("Could not find '" + raw + "' on your phone.");
            return false;
        }

        @JavascriptInterface
        public boolean toggleTorch(boolean enable) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                CameraManager cameraManager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
                if (cameraManager != null) {
                    try {
                        for (String id : cameraManager.getCameraIdList()) {
                            CameraCharacteristics chars = cameraManager.getCameraCharacteristics(id);
                            Boolean flashAvailable = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                            Integer lensFacing = chars.get(CameraCharacteristics.LENS_FACING);
                            if (flashAvailable != null && flashAvailable) {
                                if (lensFacing == null || lensFacing == CameraCharacteristics.LENS_FACING_BACK) {
                                    cameraManager.setTorchMode(id, enable);
                                    isTorchOn = enable;
                                    return true;
                                }
                            }
                        }
                        // Fallback to first available camera if lensFacing is unknown
                        String firstId = cameraManager.getCameraIdList()[0];
                        cameraManager.setTorchMode(firstId, enable);
                        isTorchOn = enable;
                        return true;
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            }
            return false;
        }

        @JavascriptInterface
        public void vibrate(long milliseconds) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    VibratorManager vm = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                    if (vm != null) {
                        Vibrator v = vm.getDefaultVibrator();
                        if (v != null && v.hasVibrator()) {
                            v.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE));
                            return;
                        }
                    }
                }
                Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        v.vibrate(milliseconds);
                    }
                }
            } catch (Exception ignored) {}
        }


        @JavascriptInterface
        public String getBatteryStatus() {
            try {
                BatteryManager bm = (BatteryManager) context.getSystemService(Context.BATTERY_SERVICE);
                if (bm != null) {
                    int level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
                    boolean isCharging = false;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        int status = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_STATUS);
                        isCharging = (status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL);
                    }
                    return "{\"level\":" + level + ",\"isCharging\":" + isCharging + "}";
                }
            } catch (Exception e) {}
            return "{\"level\":-1,\"isCharging\":false}";
        }

        @JavascriptInterface
        public boolean setVolume(int percent) {
            try {
                AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    int target = Math.max(0, Math.min(max, (int) Math.round((percent / 100.0) * max)));
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, target, AudioManager.FLAG_SHOW_UI);
                    return true;
                }
            } catch (Exception e) {}
            return false;
        }

        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> Toast.makeText(context, message, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public boolean startVoiceService() {
            try {
                AkariBackgroundVoiceService.start(context);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean stopVoiceService() {
            try {
                AkariBackgroundVoiceService.stop(context);
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }

    private void checkAndRequestPermissions() {
        List<String> permissions = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.RECORD_AUDIO);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.MODIFY_AUDIO_SETTINGS) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.MODIFY_AUDIO_SETTINGS);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        if (!permissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toArray(new String[0]), 1001);
        } else {
            AkariBackgroundVoiceService.start(this);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 1001) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                AkariBackgroundVoiceService.start(this);
            }
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        checkAndRequestPermissions();

        // Auto-grant WebView media stream permissions and register native AndroidBridge
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebSettings webSettings = this.bridge.getWebView().getSettings();
            webSettings.setMediaPlaybackRequiresUserGesture(false);

            this.bridge.getWebView().addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");
            this.bridge.getWebView().setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> request.grant(request.getResources()));
                }
            });
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            AkariBackgroundVoiceService.start(this);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Prevent WebView from freezing Web Audio and WebSocket streaming when switching apps
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().onResume();
            this.bridge.getWebView().resumeTimers();
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        // Keep WebView audio processing active when app is running in background
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().onResume();
            this.bridge.getWebView().resumeTimers();
        }
    }
}
