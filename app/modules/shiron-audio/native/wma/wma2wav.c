/*
 * Windows Media (WMA, or the sound of a WMV) → 16-bit PCM WAV, with a minimal FFmpeg build
 * (ASF demuxer + WMA decoders only; see scripts/build-wma-decoder.sh). Neither iOS nor Android
 * decodes WMA; the app turns it into a WAV here and then converts that like any other file
 * (AudioProcessor on each platform). Plain C, shared by both platforms.
 *
 * Returns 0 on success, or a negative code: -1 can't open/read, -2 no audio stream,
 * -3 no decoder for it, -4 decoder error, -5 can't write the output, -6 longer than an hour.
 */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>

#define MAX_SECONDS 3600

static void put_u32(uint8_t *p, uint32_t v) { p[0] = v; p[1] = v >> 8; p[2] = v >> 16; p[3] = v >> 24; }
static void put_u16(uint8_t *p, uint16_t v) { p[0] = v; p[1] = v >> 8; }

static void wav_header(uint8_t h[44], int rate, int channels, uint32_t data_bytes) {
  memcpy(h, "RIFF", 4);
  put_u32(h + 4, 36 + data_bytes);
  memcpy(h + 8, "WAVEfmt ", 8);
  put_u32(h + 16, 16);
  put_u16(h + 20, 1); /* PCM */
  put_u16(h + 22, (uint16_t)channels);
  put_u32(h + 24, (uint32_t)rate);
  put_u32(h + 28, (uint32_t)(rate * channels * 2));
  put_u16(h + 32, (uint16_t)(channels * 2));
  put_u16(h + 34, 16);
  memcpy(h + 36, "data", 4);
  put_u32(h + 40, data_bytes);
}

static int16_t clip16(double v) {
  if (v > 1.0) v = 1.0;
  if (v < -1.0) v = -1.0;
  return (int16_t)(v * 32767.0);
}

/* One sample of channel c at index i, as -1…1, whatever the decoder's sample format. */
static double sample_at(const AVFrame *f, int c, int i, int channels) {
  switch (f->format) {
    case AV_SAMPLE_FMT_FLTP: return ((const float *)f->extended_data[c])[i];
    case AV_SAMPLE_FMT_FLT: return ((const float *)f->extended_data[0])[i * channels + c];
    case AV_SAMPLE_FMT_S16P: return ((const int16_t *)f->extended_data[c])[i] / 32768.0;
    case AV_SAMPLE_FMT_S16: return ((const int16_t *)f->extended_data[0])[i * channels + c] / 32768.0;
    case AV_SAMPLE_FMT_S32P: return ((const int32_t *)f->extended_data[c])[i] / 2147483648.0;
    case AV_SAMPLE_FMT_S32: return ((const int32_t *)f->extended_data[0])[i * channels + c] / 2147483648.0;
    default: return 0;
  }
}

static int write_frame(FILE *out, const AVFrame *f, int channels, uint64_t *bytes) {
  int16_t buf[4096];
  int n = 0;
  for (int i = 0; i < f->nb_samples; i++) {
    for (int c = 0; c < channels; c++) {
      buf[n++] = clip16(sample_at(f, c, i, channels));
      if (n == 4096) {
        if (fwrite(buf, 2, n, out) != (size_t)n) return -5;
        *bytes += 2 * n;
        n = 0;
      }
    }
  }
  if (n && fwrite(buf, 2, n, out) != (size_t)n) return -5;
  *bytes += 2 * n;
  return 0;
}

static int drain(AVCodecContext *ctx, AVFrame *frame, FILE *out, int channels, uint64_t *bytes) {
  for (;;) {
    int r = avcodec_receive_frame(ctx, frame);
    if (r == AVERROR(EAGAIN) || r == AVERROR_EOF) return 0;
    if (r < 0) return -4;
    r = write_frame(out, frame, channels, bytes);
    av_frame_unref(frame);
    if (r < 0) return r;
    if (*bytes > (uint64_t)MAX_SECONDS * ctx->sample_rate * channels * 2) return -6;
  }
}

int shiron_wma_to_wav(const char *input, const char *output) {
  AVFormatContext *fmt = NULL;
  AVCodecContext *ctx = NULL;
  AVPacket *pkt = NULL;
  AVFrame *frame = NULL;
  FILE *out = NULL;
  uint64_t bytes = 0;
  int ret = -1;

  av_log_set_level(AV_LOG_ERROR);
  if (avformat_open_input(&fmt, input, NULL, NULL) < 0) goto done;
  if (avformat_find_stream_info(fmt, NULL) < 0) goto done;
  int idx = av_find_best_stream(fmt, AVMEDIA_TYPE_AUDIO, -1, -1, NULL, 0);
  if (idx < 0) { ret = -2; goto done; }
  const AVCodec *codec = avcodec_find_decoder(fmt->streams[idx]->codecpar->codec_id);
  if (!codec) { ret = -3; goto done; }
  ctx = avcodec_alloc_context3(codec);
  if (!ctx || avcodec_parameters_to_context(ctx, fmt->streams[idx]->codecpar) < 0 || avcodec_open2(ctx, codec, NULL) < 0) {
    ret = -3;
    goto done;
  }
  int channels = ctx->ch_layout.nb_channels;
  if (channels < 1 || ctx->sample_rate < 1) { ret = -2; goto done; }

  out = fopen(output, "wb");
  if (!out) { ret = -5; goto done; }
  uint8_t header[44];
  wav_header(header, ctx->sample_rate, channels, 0);
  if (fwrite(header, 1, 44, out) != 44) { ret = -5; goto done; }

  pkt = av_packet_alloc();
  frame = av_frame_alloc();
  if (!pkt || !frame) { ret = -4; goto done; }
  while (av_read_frame(fmt, pkt) >= 0) {
    if (pkt->stream_index == idx) {
      // A damaged packet is skipped rather than failing the whole song.
      if (avcodec_send_packet(ctx, pkt) >= 0) {
        int r = drain(ctx, frame, out, channels, &bytes);
        if (r < 0 && r != -4) { ret = r; av_packet_unref(pkt); goto done; }
      }
    }
    av_packet_unref(pkt);
  }
  avcodec_send_packet(ctx, NULL);
  int r = drain(ctx, frame, out, channels, &bytes);
  if (r < 0 && r != -4) { ret = r; goto done; }
  if (bytes == 0) { ret = -4; goto done; }

  wav_header(header, ctx->sample_rate, channels, (uint32_t)bytes);
  if (fseek(out, 0, SEEK_SET) != 0 || fwrite(header, 1, 44, out) != 44) { ret = -5; goto done; }
  ret = 0;

done:
  if (out) {
    fclose(out);
    if (ret != 0) remove(output);
  }
  av_frame_free(&frame);
  av_packet_free(&pkt);
  avcodec_free_context(&ctx);
  avformat_close_input(&fmt);
  return ret;
}
