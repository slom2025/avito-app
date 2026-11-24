package ru.slom.hunter;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

/**
 * Окно приложения = тот же сайт slom2025.github.io/avito-app (обновляется сам, как раньше).
 * Уведомления показывает не сайт, а PollService.
 */
public class MainActivity extends Activity {
    static final String HOME = "https://slom2025.github.io/avito-app/";
    private WebView web;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.parseColor("#0f1115"));
        getWindow().setNavigationBarColor(Color.parseColor("#0f1115"));
        PollService.channels(this);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0f1115"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " HunterApp/" + BuildConfigLite.version(this));
        web.addJavascriptInterface(new Bridge(), "HunterApp");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return handle(r.getUrl().toString());
            }
        });
        setContentView(web);
        if (b != null) web.restoreState(b); else web.loadUrl(HOME);

        askPermissions();
        PollService.start(this);
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }

    /** Свои страницы открываем внутри, всё остальное (Авито, GitHub) отдаём системе. */
    private boolean handle(String url) {
        if (url.startsWith(HOME)) return false;
        try {
            if (url.startsWith("intent:")) {
                Intent i = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                try { startActivity(i); }
                catch (Exception e) {
                    String fb = i.getStringExtra("browser_fallback_url");
                    if (fb != null) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fb)));
                }
            } else {
                startActivity(avitoIntent(this, url));
            }
        } catch (Exception ignored) { }
        return true;
    }

    /** Ссылку Авито открываем сразу в приложении Авито, если оно стоит; иначе в браузере. */
    static Intent avitoIntent(Context c, String url) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        try {
            String host = Uri.parse(url).getHost();
            if (host != null && (host.equals("avito.ru") || host.endsWith(".avito.ru"))) {
                Intent a = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage("com.avito.android");
                if (a.resolveActivity(c.getPackageManager()) != null) return a;
            }
        } catch (Exception ignored) { }
        return i;
    }

    private void askPermissions() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
        SharedPreferences p = PollService.prefs(this);
        PowerManager pm = getSystemService(PowerManager.class);
        if (!pm.isIgnoringBatteryOptimizations(getPackageName()) && !p.getBoolean("asked_battery", false)) {
            p.edit().putBoolean("asked_battery", true).apply();
            try {
                startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
            } catch (Exception ignored) { }
        }
    }

    /** То, что видит сайт как window.HunterApp. */
    class Bridge {
        @JavascriptInterface public void setToken(String t) {
            if (t == null) return;
            t = t.trim();
            SharedPreferences p = PollService.prefs(MainActivity.this);
            if (t.equals(p.getString("token", ""))) { runOnUiThread(() -> PollService.start(MainActivity.this)); return; }
            p.edit().putString("token", t).remove("etag").apply();
            runOnUiThread(() -> PollService.start(MainActivity.this));
        }

        @JavascriptInterface public String status() {
            SharedPreferences p = PollService.prefs(MainActivity.this);
            PowerManager pm = getSystemService(PowerManager.class);
            boolean notif = Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
            try {
                return new JSONObject()
                        .put("version", BuildConfigLite.version(MainActivity.this))
                        .put("has_token", !p.getString("token", "").isEmpty())
                        .put("notifications", notif)
                        .put("battery_free", pm.isIgnoringBatteryOptimizations(getPackageName()))
                        .put("status", p.getString("status", ""))
                        .put("last_ok", p.getLong("last_ok", 0))
                        .put("receipts", p.getString("receipts", ""))
                        .toString();
            } catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface public void openBatterySettings() {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()))); }
                catch (Exception e) {
                    try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); } catch (Exception ignored) { }
                }
            });
        }

        @JavascriptInterface public void openNotificationSettings() {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())); }
                catch (Exception ignored) { }
            });
        }

        @JavascriptInterface public void testNotification() {
            try {
                JSONObject it = new JSONObject()
                        .put("id", "local-test-" + System.currentTimeMillis())
                        .put("title", "Проверка уведомления")
                        .put("body", "Так будет выглядеть находка")
                        .put("sent_at", System.currentTimeMillis());
                PollService.showLocal(MainActivity.this, it);
            } catch (Exception ignored) { }
        }
    }
}
