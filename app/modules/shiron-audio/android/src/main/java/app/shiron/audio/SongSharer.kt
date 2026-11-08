package app.shiron.audio

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

/**
 * "שיתוף" on Android: the song's file to the system share sheet (WhatsApp and every other app).
 *
 * Not expo-sharing: it starts the sheet *for a result* and refuses any further share until that
 * result comes back — after sending to WhatsApp it often never does (WhatsApp moves on to the
 * chat), so every later share failed with "Another share request is being processed now". It
 * also granted read access only to the apps it found for the sheet itself. Here the sheet is
 * simply started, and the read grant travels with the intent (ClipData + flag) to whichever app
 * she picks.
 */
object SongSharer {
  fun share(activity: Activity, file: File, mimeType: String, title: String) {
    val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.share", file)
    val send = Intent(Intent.ACTION_SEND).apply {
      type = mimeType
      putExtra(Intent.EXTRA_STREAM, uri)
      putExtra(Intent.EXTRA_TITLE, title)
      clipData = ClipData.newRawUri(title, uri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val chooser = Intent.createChooser(send, title).apply {
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    activity.startActivity(chooser)
  }
}
