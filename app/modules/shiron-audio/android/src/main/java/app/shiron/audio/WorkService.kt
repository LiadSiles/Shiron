package app.shiron.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Keeps the app's process alive while new songs are saved, converted and named, so that work
 * continues after she switches back to WhatsApp or locks the phone. Without it Android freezes
 * a backgrounded app within seconds. A quiet notification ("שירון מכינה שירים חדשים…") is
 * required for a foreground service; the app stops the service as soon as the queue is empty.
 * Type dataSync: Android 15 allows it ~6 h a day, far more than this work needs.
 */
class WorkService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "שירון מכינה שירים חדשים…"
    val notification = buildNotification(text)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      // Not allowed right now (e.g. started from the background on Android 12+): no harm,
      // the work simply runs only while the app is open.
      stopSelf()
    }
    return START_NOT_STICKY
  }

  /** Android 15: the daily dataSync budget ran out. Stop; the work resumes when she opens the app. */
  override fun onTimeout(startId: Int, fgsType: Int) {
    stopSelf()
  }

  private fun buildNotification(text: String): Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "הכנת שירים", NotificationManager.IMPORTANCE_LOW).apply {
          description = "מוצג בזמן ששירון שומרת ומכינה שירים חדשים"
          setShowBadge(false)
        }
      )
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION") Notification.Builder(this)
    }
    return builder
      .setContentTitle("שירון")
      .setContentText(text)
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setContentIntent(open)
      .build()
  }

  companion object {
    private const val CHANNEL_ID = "shiron_work"
    private const val NOTIFICATION_ID = 4711
    const val EXTRA_TEXT = "text"

    fun start(context: Context, text: String) {
      val intent = Intent(context, WorkService::class.java).putExtra(EXTRA_TEXT, text)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
        else context.startService(intent)
      } catch (e: Exception) {
        // ForegroundServiceStartNotAllowedException when the app is already in the background.
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, WorkService::class.java))
    }
  }
}
