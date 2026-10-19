package com.akari.ai;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
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
            final String input = appNameOrPackage.trim().toLowerCase();

            // Map friendly names to Android package names
            Map<String, String> packages = new HashMap<>();
            packages.put("whatsapp", "com.whatsapp");
            packages.put("youtube", "com.google.android.youtube");
            packages.put("spotify", "com.spotify.music");
            packages.put("instagram", "com.instagram.android");
            packages.put("telegram", "org.telegram.messenger");
            packages.put("chrome", "com.android.chrome");
            packages.put("gmail", "com.google.android.gm");
            packages.put("maps", "com.google.android.apps.maps");
            packages.put("netflix", "com.netflix.ninja");
            packages.put("twitter", "com.twitter.android");
            packages.put("x", "com.twitter.android");
            packages.put("discord", "com.discord");

            String targetPackage = packages.containsKey(input) ? packages.get(input) : appNameOrPackage;

            // Handle system action shortcuts
            if (input.equals("camera")) {
                try {
                    Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(intent);
                    return true;
                } catch (Exception e) {}
            } else if (input.equals("settings")) {
                try {
                    Intent intent = new Intent(Settings.ACTION_SETTINGS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(intent);
                    return true;
                } catch (Exception e) {}
            } else if (input.equals("dialer") || input.equals("phone")) {
                try {
                    Intent intent = new Intent(Intent.ACTION_DIAL);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(intent);
                    return true;
                } catch (Exception e) {}
            } else if (input.equals("calculator")) {
                Intent intent = new Intent();
                intent.setAction(Intent.ACTION_MAIN);
                intent.addCategory(Intent.CATEGORY_APP_CALCULATOR);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    context.startActivity(intent);
                    return true;
                } catch (Exception e) {
                    targetPackage = "com.google.android.calculator";
                }
            }

            try {
                Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(targetPackage);
                if (launchIntent != null) {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(launchIntent);
                    return true;
                }
            } catch (Exception e) {}

            // Fallback: try opening via Market details
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + targetPackage));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean toggleTorch(boolean enable) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                CameraManager cameraManager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
                if (cameraManager != null) {
                    try {
                        String cameraId = cameraManager.getCameraIdList()[0];
                        cameraManager.setTorchMode(cameraId, enable);
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
                Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        v.vibrate(milliseconds);
                    }
                }
            } catch (Exception e) {}
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
