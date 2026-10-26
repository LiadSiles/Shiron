# שירון — ספריית השירים של הגן

[![CI](https://github.com/LiadSiles/shiron/actions/workflows/ci.yml/badge.svg)](https://github.com/LiadSiles/shiron/actions/workflows/ci.yml)
[![Release](https://github.com/LiadSiles/shiron/actions/workflows/release.yml/badge.svg)](https://github.com/LiadSiles/shiron/actions/workflows/release.yml)

אפליקציה לגננת. משתפים אליה הקלטות מוואטסאפ, קבצי mp3 וקישורי יוטיוב, והיא:

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

## מבנה הריפו

```
app/        אפליקציית iOS + Android (Expo SDK 58, React Native, TypeScript)
server/     שרת עיבוד: המרת שמע, תמלול עברית, שם וקטגוריה עם Claude
docs/wiki/  ידע הנדסי: ארכיטקטורה, החלטות, מגבלות iOS, בנייה ושחרור
scripts/    העלאת גרסה ומספור בנייה
.github/    CI, שחרורים, תבניות issues ו-PR
```

## למה צריך שרת?

הודעות קוליות מוואטסאפ מגיעות בפורמט Ogg/Opus, ש**אייפון לא מנגן**. השרת:

1. ממיר אותן ל-m4a.
2. מקצץ שקט בהתחלה ובסוף ומאזן עוצמה.
3. מתמלל את השיר.
4. שולח את התמלול ל-Claude, שמחזיר שם, קטגוריות ומילות חיפוש.

השרת לא שומר שירים: קובץ מעובד נמחק אחרי 30 דקות, והספרייה נשמרת רק בטלפון.

## פיתוח

דרישות: Node 22. לשרת צריך גם ffmpeg.

```bash
npm run install:all        # תלויות של האפליקציה ושל השרת
npm run check              # בדיקת טיפוסים + בדיקות, בשני הפרויקטים
```

### שרת

```bash
cd server
cp .env.example .env       # APP_TOKEN, ANTHROPIC_API_KEY, OPENAI_API_KEY
npm start                  # http://localhost:8787
```

עם Docker (מתיקיית השורש):

```bash
docker build -f server/Dockerfile -t shiron-server .
docker run --env-file server/.env -p 8787:8787 shiron-server
```

### אפליקציה

האפליקציה משתמשת בקוד נייטיב (שיתוף מוואטסאפ, ניגון ברקע), ולכן לא רצה ב-Expo Go.

```bash
cd app
npx expo run:android            # טלפון אנדרואיד ב-USB, עם Android Studio
npx expo run:ios --device       # מק עם Xcode
```

חיבור לשרת: באפליקציה ⚙︎ ← שרת עיבוד ← כתובת + מפתח גישה (`APP_TOKEN`).

### שחרור גרסה

```bash
npm run version:bump -- minor   # מעדכן app.json ו-package.json ומוסיף כותרת ב-CHANGELOG
git commit -am "Release 0.2.0" && git push
```

הדחיפה ל-`main` בונה APK ו-IPA ומפרסמת שחרור `v0.2.0` עם הערות מתוך `CHANGELOG.md`. הפרטים ב-[docs/wiki/build-and-release.md](docs/wiki/build-and-release.md).

## תיעוד

- [`CLAUDE.md`](CLAUDE.md): הנחיות לעבודה עם מודל שפה בריפו. מגבלות קשיחות, מפת קוד וכללי עבודה.
- [`docs/wiki/`](docs/wiki/README.md): ידע הנדסי שמתעדכן יחד עם הקוד.
- [`CHANGELOG.md`](CHANGELOG.md): מה השתנה בכל גרסה.
- מסמך התכנון (Claude Docs): "שירון הגן — תוכנית מוצר ועיצוב".

כל הזכויות שמורות. הריפו פרטי.
