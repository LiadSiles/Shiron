/* JNI entry for Android (app.shiron.audio.WmaDecoder.toWav). */
#include <jni.h>

int shiron_wma_to_wav(const char *input, const char *output);

JNIEXPORT jint JNICALL Java_app_shiron_audio_WmaDecoder_toWav(JNIEnv *env, jclass cls, jstring input, jstring output) {
  (void)cls;
  const char *in = (*env)->GetStringUTFChars(env, input, NULL);
  const char *out = (*env)->GetStringUTFChars(env, output, NULL);
  jint r = (in && out) ? shiron_wma_to_wav(in, out) : -1;
  if (in) (*env)->ReleaseStringUTFChars(env, input, in);
  if (out) (*env)->ReleaseStringUTFChars(env, output, out);
  return r;
}
