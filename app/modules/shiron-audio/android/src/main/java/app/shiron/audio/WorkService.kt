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
 * a backgrounded app within seconds. A quiet notification ("PlayGan מכינה שירים חדשים…") is
 * required for a foreground service; the app stops the service as soon as the queue is empty.
 * Type dataSync: Android 15 allows it ~6 h a day, far more than this work needs.
 */
class WorkService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "PlayGan מכינה שירים חדשים…"
    // A service started with startForegroundService() MUST call startForeground() — even if the
    // work already ended — or Android kills the whole app ("did not then call startForeground").
    // So it always goes foreground first, and only then honours a stop that came in meanwhile.
    try {
      val notification = buildNotification(text)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      // Not allowed right now: the work simply runs only while the app is open.
    }
    synchronized(lock) {
      foreground = true
      if (stopRequested) finish()
    }
    return START_NOT_STICKY
  }

  private fun finish() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE)
    else @Suppress("DEPRECATION") stopForeground(true)
    stopSelf()
  }

  override fun onDestroy() {
    synchronized(lock) {
      instance = null
      foreground = false
    }
    super.onDestroy()
  }

  override fun onCreate() {
    super.onCreate()
    synchronized(lock) { instance = this }
  }

  /** Android 15: the daily dataSync budget ran out. Stop; the work resumes when she opens the app. */
  override fun onTimeout(startId: Int, fgsType: Int) {
    finish()
  }

  private fun buildNotification(text: String): Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "הכנת שירים", NotificationManager.IMPORTANCE_LOW).apply {
          description = "מוצג בזמן ש-PlayGan שומרת ומכינה שירים חדשים"
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
      .setContentTitle("PlayGan")
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

    private val lock = Any()
    private var instance: WorkService? = null
    /** startForeground() was called on the running instance: stopping it now is safe. */
    private var foreground = false
    /** Work ended before the service went foreground: it stops itself right after. */
    private var stopRequested = false

    fun start(context: Context, text: String) {
      synchronized(lock) { stopRequested = false }
      val intent = Intent(context, WorkService::class.java).putExtra(EXTRA_TEXT, text)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
        else context.startService(intent)
      } catch (e: Exception) {
        // ForegroundServiceStartNotAllowedException when the app is already in the background.
      }
    }

    /**
     * Never stopService() directly: if the service hasn't reached startForeground() yet, that
     * crashes the app. Ask it to stop, and let it do so once it is safely foreground.
     */
    fun stop() {
      synchronized(lock) {
        stopRequested = true
        val service = instance
        if (service != null && foreground) {
          android.os.Handler(android.os.Looper.getMainLooper()).post {
            // A new start() may have come in since: then keep running.
            synchronized(lock) { if (stopRequested && instance === service) service.finish() }
          }
        }
      }
    }
  }
}
