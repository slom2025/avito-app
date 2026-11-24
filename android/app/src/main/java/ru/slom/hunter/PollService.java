package ru.slom.hunter;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.Locale;

/**
 * Сам раз в 20 секунд смотрит feed.json в своём хранилище GitHub и показывает
 * уведомление о каждой новой находке. Chrome и Google в этой цепочке не участвуют.
 */
public class PollService extends Service {
    static final String FEED_URL = "https://api.github.com/repos/slom2025/avito-app-data/contents/feed.json";
    static final String CH_DEALS = "deals";
    static final String CH_SERVICE = "service";
    static final int ID_ONGOING = 1;
    static final long INTERVAL_MS = 20_000;
    static final int SEEN_MAX = 600;

    private volatile boolean running;
    private Thread worker;
    private PowerManager.WakeLock wake;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("hunter", MODE_PRIVATE); }

    static void start(Context c) {
        if (prefs(c).getString("token", "").isEmpty()) return;
        Intent i = new Intent(c, PollService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    static void channels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel deals = new NotificationChannel(CH_DEALS, "Находки", NotificationManager.IMPORTANCE_HIGH);
        deals.setDescription("Выгодные объявления");
        deals.enableVibration(true);
        nm.createNotificationChannel(deals);
        NotificationChannel svc = new NotificationChannel(CH_SERVICE, "Служба проверки", NotificationManager.IMPORTANCE_MIN);
        svc.setDescription("Постоянная строка: приложение следит за находками");
        svc.setShowBadge(false);
        nm.createNotificationChannel(svc);
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        channels(this);
        Notification n = ongoing("Запускаюсь…");
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID_ONGOING, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(ID_ONGOING, n);
        if (worker == null || !worker.isAlive()) {
            running = true;
            PowerManager pm = getSystemService(PowerManager.class);
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "hunter:poll");
            wake.setReferenceCounted(false);
            wake.acquire();
            worker = new Thread(this::loop, "hunter-poll");
            worker.start();
        }
        return START_STICKY;
    }

    @Override public void onDestroy() {
        running = false;
        if (worker != null) worker.interrupt();
        if (wake != null && wake.isHeld()) wake.release();
        super.onDestroy();
    }

    private Notification ongoing(String text) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CH_SERVICE)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle("Охотник следит за находками")
                .setContentText(text)
                .setContentIntent(pi)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .build();
    }

    private void status(String text) {
        prefs(this).edit().putString("status", text).apply();
        getSystemService(NotificationManager.class).notify(ID_ONGOING, ongoing(text));
    }

    private void loop() {
        while (running) {
            long t0 = System.currentTimeMillis();
            try {
                checkOnce();
            } catch (Throwable e) {
                status("Нет связи, повторю через 20 с (" + hhmm(t0) + ")");
            }
            long left = INTERVAL_MS - (System.currentTimeMillis() - t0);
            if (left > 0) {
                try { Thread.sleep(left); } catch (InterruptedException ie) { return; }
            }
        }
    }

    private void checkOnce() throws Exception {
        SharedPreferences p = prefs(this);
        String token = p.getString("token", "");
        if (token.isEmpty()) { status("Нет ключа: открой приложение, вкладка «Ещё»"); return; }
        HttpURLConnection c = (HttpURLConnection) new URL(FEED_URL).openConnection();
        c.setConnectTimeout(10_000);
        c.setReadTimeout(15_000);
        c.setUseCaches(false);
        c.setRequestProperty("Authorization", "Bearer " + token);
        c.setRequestProperty("Accept", "application/vnd.github.raw+json");
        c.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
        c.setRequestProperty("User-Agent", "hunter-app");
        String etag = p.getString("etag", "");
        if (!etag.isEmpty()) c.setRequestProperty("If-None-Match", etag);
        int code = c.getResponseCode();
        long now = System.currentTimeMillis();
        if (code == 304) { c.disconnect(); status("Проверено в " + hhmm(now) + ", нового нет"); return; }
        if (code == 401 || code == 403) { c.disconnect(); status("Ключ не подходит (" + code + "), вставь заново во вкладке «Ещё»"); return; }
        if (code != 200) { c.disconnect(); status("GitHub ответил " + code + " в " + hhmm(now) + ", повторю"); return; }
        String body = read(c.getInputStream());
        String newTag = c.getHeaderField("ETag");
        c.disconnect();

        JSONArray items = new JSONObject(body).optJSONArray("items");
        if (items == null) items = new JSONArray();
        LinkedHashSet<String> seen = new LinkedHashSet<>(Arrays.asList(p.getString("seen", "").split(",")));
        seen.remove("");
        boolean primed = p.getBoolean("primed", false);
        ArrayList<JSONObject> fresh = new ArrayList<>();
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            String id = it.optString("id", it.optString("url", ""));
            if (id.isEmpty() || seen.contains(id)) continue;
            seen.add(id);
            if (primed) fresh.add(it);
        }
        // Старые первыми, чтобы самая свежая находка оказалась сверху шторки
        fresh.sort((a, b) -> Long.compare(a.optLong("sent_at"), b.optLong("sent_at")));
        for (JSONObject it : fresh) notifyItem(this, it, now);

        ArrayList<String> keep = new ArrayList<>(seen);
        if (keep.size() > SEEN_MAX) keep = new ArrayList<>(keep.subList(keep.size() - SEEN_MAX, keep.size()));
        SharedPreferences.Editor e = p.edit()
                .putString("seen", String.join(",", keep))
                .putBoolean("primed", true)
                .putLong("last_ok", now);
        if (newTag != null) e.putString("etag", newTag);
        e.apply();
        status("Проверено в " + hhmm(now) + (fresh.isEmpty() ? ", нового нет" : ", новых: " + fresh.size()));
    }

    static void showLocal(Context c, JSONObject it) { channels(c); notifyItem(c, it, System.currentTimeMillis()); }

    static void notifyItem(Context ctx, JSONObject it, long now) {
        String url = it.optString("url", "");
        String title = it.optString("title", "Находка");
        String price = it.optString("price", "");
        String body = it.optString("body", "");
        long sent = it.optLong("sent_at", 0);
        String head = price.isEmpty() ? title : price + " · " + title;
        String delay = sent > 0 ? "через " + Math.max(0, (now - sent) / 1000) + " с после отправки" : "";

        Intent view = url.isEmpty() ? new Intent(ctx, MainActivity.class) : MainActivity.avitoIntent(ctx, url);
        view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int nid = (it.optString("id", url)).hashCode();
        PendingIntent pi = PendingIntent.getActivity(ctx, nid, view, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification n = new Notification.Builder(ctx, CH_DEALS)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(head)
                .setContentText(body.split("\n", 2)[0])
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setSubText(delay)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setWhen(sent > 0 ? sent : now)
                .setShowWhen(true)
                .build();
        ctx.getSystemService(NotificationManager.class).notify(nid, n);
        logReceipt(ctx, it.optString("id", url), sent, now);
    }

    /** Локальный журнал: когда находка дошла до телефона (для замера скорости). */
    static void logReceipt(Context ctx, String id, long sent, long got) {
        SharedPreferences p = prefs(ctx);
        String log = p.getString("receipts", "");
        String line = id + ":" + sent + ":" + got;
        String[] parts = log.isEmpty() ? new String[0] : log.split(";");
        int from = Math.max(0, parts.length - 99);
        StringBuilder sb = new StringBuilder();
        for (int i = from; i < parts.length; i++) sb.append(parts[i]).append(';');
        sb.append(line);
        p.edit().putString("receipts", sb.toString()).apply();
    }

    static String hhmm(long t) { return new SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new Date(t)); }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toString("UTF-8");
    }
}
