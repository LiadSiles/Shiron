package app.shiron.audio

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

/**
 * "שיתוף" on Android: songs (files under cache/share/) and/or text (YouTube links) to the
 * system share sheet — WhatsApp and every other app. One song, or a whole list or category.
 *
 * Not expo-sharing: it starts the sheet *for a result* and refuses any further share until that
 * result comes back — after sending to WhatsApp it often never does (WhatsApp moves on to the
 * chat), so every later share failed with "Another share request is being processed now". It
 * also granted read access only to the apps it found for the sheet itself. Here the sheet is
 * simply started, and the read grant travels with the intent (ClipData + flag) to whichever app
 * she picks.
 */
object SongSharer {
  fun share(activity: Activity, files: List<File>, mimeType: String, text: String?, title: String) {
    val uris = files.map { FileProvider.getUriForFile(activity, "${activity.packageName}.share", it) }
    val send = when {
      uris.isEmpty() -> Intent(Intent.ACTION_SEND).apply { type = "text/plain" }
      uris.size == 1 -> Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uris[0])
      }
      else -> Intent(Intent.ACTION_SEND_MULTIPLE).apply {
        type = mimeType
        putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList<Uri>(uris))
      }
    }
    send.putExtra(Intent.EXTRA_TITLE, title)
    if (!text.isNullOrEmpty()) send.putExtra(Intent.EXTRA_TEXT, text)
    if (uris.isNotEmpty()) {
      val clip = ClipData.newRawUri(title, uris[0])
      uris.drop(1).forEach { clip.addItem(ClipData.Item(it)) }
      send.clipData = clip
      send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val chooser = Intent.createChooser(send, title).apply {
      if (uris.isNotEmpty()) addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    activity.startActivity(chooser)
  }
}
