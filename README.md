# PlayGan — ספריית השירים של הגן

(שם הפרויקט בקוד ובמאגר נשאר Shiron.)

[![CI](https://github.com/LiadSiles/shiron/actions/workflows/ci.yml/badge.svg)](https://github.com/LiadSiles/shiron/actions/workflows/ci.yml)
[![Native audio](https://github.com/LiadSiles/shiron/actions/workflows/native.yml/badge.svg)](https://github.com/LiadSiles/shiron/actions/workflows/native.yml)
[![Release](https://github.com/LiadSiles/shiron/actions/workflows/release.yml/badge.svg)](https://github.com/LiadSiles/shiron/actions/workflows/release.yml)

אפליקציה לגננת. משתפים אליה הקלטות מוואטסאפ, קבצי שמע וסרטונים, וקישורי יוטיוב, והיא:

- שומרת אותם ונותנת לכל שיר שם.
- מסווגת לקטגוריות.
- ממיינת לפי שימוש.
- מחפשת לפי מילים מהשיר.
- מנגנת גם כשהמסך כבוי.

אייפון הוא הפלטפורמה העיקרית, וגם אנדרואיד נתמך.

## הורדה

כל גרסה מתפרסמת בעמוד **[Releases](https://github.com/LiadSiles/shiron/releases)**:

| קובץ | למה | התקנה |
| --- | --- | --- |
| `shiron-<גרסה>.apk` | אנדרואיד | מורידים בטלפון ופותחים |
| `shiron-<גרסה>.ipa` | אייפון | עם [Sideloadly](https://sideloadly.io) מהמחשב ו-Apple ID |

כל דחיפה ל-`main` מייצרת גם בנייה לבדיקה (`v<גרסה>-build.<n>`) עם APK בלבד. הוראות ההתקנה המלאות מופיעות בכל שחרור.

## איך זה עובד

אין שרת. כל העיבוד קורה באפליקציה:

1. **שמע, בטלפון:** מודול נייטיב (Swift לאייפון, Kotlin לאנדרואיד) מפענח כל פורמט שעשוי להגיע:
   - הקלטות וואטסאפ (Opus)
   - mp3, m4a, wav, flac, amr
   - השמע מתוך סרטוני mp4, mov, 3gp ו-mpeg

   אחר כך הוא מקצץ שקט בהתחלה ובסוף, מאזן עוצמה, ושומר כ-m4a שכל טלפון מנגן. זה לא דורש אינטרנט, והשיר מתנגן תוך שניות.
2. **הבנה, בענן:** תמלול עם Whisper, ושם, קטגוריות ומילות חיפוש ממודל שפה. שני השלבים רצים ב-[Groq](https://console.groq.com), שירות AI חינמי, עם מפתח של המשתמשת.

   האפליקציה מובילה אותה בחיבור: פותחת את דף המפתחות של Groq, ומזהה לבד את המפתח שהועתק. בלי מפתח, השירים נשמרים ומתנגנים, ורק השם והקטגוריה ממתינים.

## פיתוח

דרישות: Node 22.

```bash
npm run install:all     # תלויות
npm run check           # בדיקת טיפוסים + בדיקות
npm run test:ios-audio  # בדיקות מודול השמע על מק (Swift)
```

האפליקציה משתמשת בקוד נייטיב (מודול השמע, שיתוף מוואטסאפ, ניגון ברקע), ולכן לא רצה ב-Expo Go:

```bash
cd app
npx expo run:android            # טלפון אנדרואיד ב-USB, עם Android Studio
npx expo run:ios --device       # מק עם Xcode
```

ה-CI מריץ את מודול השמע על מק ועל אמולטור אנדרואיד, עם קבצי בדיקה בכל הפורמטים.

### שחרור גרסה

```bash
npm run version:bump -- minor   # מעדכן app.json ו-package.json ומוסיף כותרת ב-CHANGELOG
git commit -am "Release 0.3.0" && git push
```

הדחיפה ל-`main` בונה APK ו-IPA ומפרסמת שחרור עם הערות מתוך `CHANGELOG.md`. הפרטים ב-[docs/wiki/build-and-release.md](docs/wiki/build-and-release.md).

## תיעוד

- [`CLAUDE.md`](CLAUDE.md): הנחיות לעבודה עם מודל שפה בריפו. מגבלות קשיחות, מפת קוד וכללי עבודה.
- [`docs/wiki/`](docs/wiki/README.md): ידע הנדסי שמתעדכן יחד עם הקוד.
- [`CHANGELOG.md`](CHANGELOG.md): מה השתנה בכל גרסה.
- מסמך התכנון (Claude Docs): "שירון הגן — תוכנית מוצר ועיצוב".

כל הזכויות שמורות. הריפו פרטי.
