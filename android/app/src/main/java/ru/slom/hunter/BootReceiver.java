package ru.slom.hunter;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** После перезагрузки телефона или обновления приложения снова запускает проверку находок. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        try { PollService.start(context); } catch (Throwable ignored) { }
    }
}
