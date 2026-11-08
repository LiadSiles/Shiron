package app.shiron.audio

import androidx.core.content.FileProvider

/** Our own provider class, so the manifest merge never collides with another library's FileProvider. */
class ShareFileProvider : FileProvider()
