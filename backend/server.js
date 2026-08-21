const express = require("express");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs").promises;
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");

// КОНФИГУРАЦИЯ И КОНСТАНТЫ
const CONFIG = {
  PORT: process.env.PORT || 3000,
  FILE_PATH: path.join(__dirname, "График_дежурств.xlsx"),
  WEEKS_FILE_PATH: path.join(__dirname, "weeks.json"),
  WEEKS_TO_GENERATE: 30,
  SHEETS: {
    SEMESTER: "семестр",
    SESSION_PREFIX: "сессия",
  },
};

const COLS = {
  DAY: ["Дни нед.", "День", "день"],
  TIME: ["Часы", "время", "Время"],
  DUTY: ["Джамбула", "Вознесенский", "Воснесенский", "Джамбула доп."],
};

// УТИЛИТЫ
const extractValue = (row, possibleKeys) => {
  const key = possibleKeys.find((k) => row[k] !== undefined);
  return key ? String(row[key]).trim() : "";
};

const hasDutyAssigned = (row) => {
  return COLS.DUTY.some((key) => String(row[key] || "").trim() !== "");
};

// БИЗНЕС-ЛОГИКА
class ScheduleParser {
  static parseSemester(sheet) {
    if (!sheet) return [];

    const rawData = xlsx.utils.sheet_to_json(sheet, { defval: "" });
    const dayGroups = new Map();
    let currentDay = "";

    for (const row of rawData) {
      const day = extractValue(row, COLS.DAY);
      const time = extractValue(row, COLS.TIME);
      const hasDuty = hasDutyAssigned(row);

      if (!time && !hasDuty) continue;

      if (day) {
        currentDay = day.toLowerCase();
        if (!dayGroups.has(currentDay)) {
          dayGroups.set(currentDay, []);
        }
      }

      if (!currentDay) continue;

      const currentDayBlocks = dayGroups.get(currentDay);

      if (time) {
        const existingBlock = currentDayBlocks.find((b) => b.time === time);

        if (!existingBlock) {
          currentDayBlocks.push({ time, num: { ...row }, den: null });
        } else if (hasDuty) {
          if (!existingBlock.num) {
            existingBlock.num = { ...row };
          } else if (!existingBlock.den) {
            existingBlock.den = { ...row, "Часы": "" };
          }
        }
      } else if (currentDayBlocks.length > 0) {
        const lastBlock = currentDayBlocks[currentDayBlocks.length - 1];
        if (!lastBlock.den) {
          const dayKey = COLS.DAY.find((k) => row[k] !== undefined) || "Дни нед.";
          lastBlock.den = { ...row, "Часы": "", [dayKey]: day || currentDay };
        }
      }
    }

    return this._flattenSemesterData(dayGroups);
  }

  static _flattenSemesterData(dayGroupsMap) {
    const semesterData = [];

    for (const [day, blocks] of dayGroupsMap.entries()) {
      for (const block of blocks) {
        if (block.num) semesterData.push(block.num);

        if (block.den) {
          semesterData.push(block.den);
        } else {
          const baseRow = block.num || {};
          const dayKey = COLS.DAY.find((k) => baseRow[k] !== undefined) || "Дни нед.";
          semesterData.push({
            [dayKey]: baseRow[dayKey] || day,
            "Часы": "",
            "Джамбула": "",
            "Вознесенский": "",
            "Джамбула доп.": "",
            "Информация": "",
          });
        }
      }
    }
    return semesterData;
  }

  static parseSession(sheet) {
    if (!sheet) return [];

    const rawData = xlsx.utils.sheet_to_json(sheet, { defval: "" });
    const sessionData = [];
    let currentDay = "";

    for (const row of rawData) {
      const day = extractValue(row, COLS.DAY);
      const time = extractValue(row, COLS.TIME);
      const hasDuty = hasDutyAssigned(row);

      if (!time && !hasDuty) continue;

      if (day) {
        currentDay = day;
      } else if (currentDay) {
        const dayKey = COLS.DAY.find((k) => row[k] !== undefined) || "День";
        row[dayKey] = currentDay;
      }

      sessionData.push(row);
    }

    return sessionData;
  }
}

// СЕРВИС ДАННЫХ
class ScheduleService {
  constructor(filePath) {
    this.filePath = filePath;
    this.cache = null;
    this.lastModifiedTime = 0;
  }

  async getSchedule() {
    try {
      const stats = await fs.stat(this.filePath);

      if (this.cache && stats.mtimeMs === this.lastModifiedTime) {
        return this.cache;
      }

      console.log("📖 Чтение и парсинг Excel файла...");
      const fileBuffer = await fs.readFile(this.filePath);
      const workbook = xlsx.read(fileBuffer, { type: "buffer" });

      const semesterSheet = workbook.Sheets[CONFIG.SHEETS.SEMESTER];

      const dynamicSessionSheetName = workbook.SheetNames.find((name) =>
        name.toLowerCase().startsWith(CONFIG.SHEETS.SESSION_PREFIX)
      );

      const sessionSheet = dynamicSessionSheetName
        ? workbook.Sheets[dynamicSessionSheetName]
        : null;

      if (!sessionSheet) {
        console.warn(`⚠️ Предупреждение: Страница, начинающаяся с "${CONFIG.SHEETS.SESSION_PREFIX}", не найдена в файле.`);
      } else {
        console.log(`✅ Найдена страница сессии: "${dynamicSessionSheetName}"`);
      }

      this.cache = {
        semester: ScheduleParser.parseSemester(semesterSheet),
        session: ScheduleParser.parseSession(sessionSheet),
      };

      this.lastModifiedTime = stats.mtimeMs;
      return this.cache;
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error("EXCEL_NOT_FOUND");
      }
      throw error;
    }
  }

  invalidateCache() {
    this.cache = null;
    this.lastModifiedTime = 0;
  }
}

// РАЗБОР "СЧЁТА НЕДЕЛЬ" ИЗ ТЕКСТА PDF
function formatDate(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function parseWeeksFromText(text, weeksCount) {
  const halfMatch = text.match(/(\d)\s*полугодие\s*(\d{4})\/(\d{4})/i);
  if (!halfMatch) {
    throw new Error(
      "Не нашёл в файле строку с учебным годом (заголовок вида «Счёт недель на 1 полугодие 2026/2027 уч.года»)"
    );
  }
  const [, half, year1, year2] = halfMatch;
  const startYear = half === "1" ? Number(year1) : Number(year2);

  const captionMatch = text.match(
    /[cс]\s*(\d{2})\.(\d{2})\s*по\s*(\d{2})\.(\d{2})[\s\S]*?занятия\s*по\s*["«]?\s*(числителю|знаменателю)/i
  );
  if (!captionMatch) {
    throw new Error(
      "Не нашёл пояснение вида «с ДД.ММ по ДД.ММ - ... занятия по числителю/знаменателю» — без него не от чего оттолкнуться"
    );
  }
  const [, sDay, sMonth, eDay, eMonth, typeWord] = captionMatch;

  let currentStart = new Date(startYear, Number(sMonth) - 1, Number(sDay));
  let currentEnd = new Date(startYear, Number(eMonth) - 1, Number(eDay));
  let currentType = /числ/i.test(typeWord) ? "Числитель" : "Знаменатель";

  const weeks = [];
  for (let i = 0; i < weeksCount; i++) {
    weeks.push({
      week: i + 1,
      start: formatDate(currentStart),
      end: formatDate(currentEnd),
      type: currentType,
    });

    const nextStart = new Date(currentEnd);
    nextStart.setDate(nextStart.getDate() + 1);
    const nextEnd = new Date(nextStart);
    nextEnd.setDate(nextEnd.getDate() + 6);

    currentStart = nextStart;
    currentEnd = nextEnd;
    currentType = currentType === "Числитель" ? "Знаменатель" : "Числитель";
  }

  return weeks;
}

function validateAndParseScheduleBuffer(buffer) {
  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: "buffer" });
  } catch (e) {
    throw new Error("Не удалось прочитать файл — это точно .xlsx?");
  }

  const semesterSheet = workbook.Sheets[CONFIG.SHEETS.SEMESTER];
  if (!semesterSheet) {
    throw new Error(`В файле не найден лист "${CONFIG.SHEETS.SEMESTER}" — проверьте название листа`);
  }

  const sessionSheetName = workbook.SheetNames.find((name) =>
    name.toLowerCase().startsWith(CONFIG.SHEETS.SESSION_PREFIX)
  );
  if (!sessionSheetName) {
    throw new Error(`Не нашёл лист, начинающийся со слова "${CONFIG.SHEETS.SESSION_PREFIX}" — проверьте название листа`);
  }

  const semester = ScheduleParser.parseSemester(semesterSheet);
  const session = ScheduleParser.parseSession(workbook.Sheets[sessionSheetName]);

  if (!semester.length) {
    throw new Error(`Лист "${CONFIG.SHEETS.SEMESTER}" распознан, но строк с расписанием в нём не нашлось`);
  }
  if (!session.length) {
    throw new Error(`Лист "${sessionSheetName}" распознан, но строк с расписанием в нём не нашлось`);
  }

  return { semester, session, sessionSheetName };
}

// ИНИЦИАЛИЗАЦИЯ EXPRESS
const app = express();
const scheduleService = new ScheduleService(CONFIG.FILE_PATH);
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Ожидается PDF-файл"));
    }
    cb(null, true);
  },
});
const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith(".xlsx")) {
      return cb(new Error("Ожидается файл .xlsx"));
    }
    cb(null, true);
  },
});

app.use(cors());
app.use(express.json());

app.get("/api/schedule", async (req, res, next) => {
  try {
    const data = await scheduleService.getSchedule();
    res.json(data);
  } catch (error) {
    if (error.message === "EXCEL_NOT_FOUND") {
      return res.status(404).json({ error: "Файл расписания не найден на сервере" });
    }
    console.error("❌ Ошибка при обработке расписания:", error);
    res.status(500).json({ error: "Внутренняя ошибка сервера при обработке расписания" });
  }
});

app.post("/api/schedule/upload", xlsxUpload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Файл не передан" });
  }

  try {
    const { semester, session, sessionSheetName } = validateAndParseScheduleBuffer(req.file.buffer);

    await fs.writeFile(CONFIG.FILE_PATH, req.file.buffer);
    scheduleService.invalidateCache();

    res.json({
      ok: true,
      semesterRows: semester.length,
      sessionRows: session.length,
      sessionSheetName,
    });
  } catch (error) {
    console.error("❌ Ошибка при загрузке графика дежурств:", error);
    res.status(400).json({ error: error.message || "Не удалось обработать файл" });
  }
});

app.get("/api/weeks", async (req, res) => {
  try {
    const content = await fs.readFile(CONFIG.WEEKS_FILE_PATH, "utf-8");
    res.json(JSON.parse(content));
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.json([]);
    }
    console.error("❌ Ошибка при чтении файла счёта недель:", error);
    res.status(500).json({ error: "Внутренняя ошибка сервера при чтении счёта недель" });
  }
});

app.post("/api/weeks/parse", pdfUpload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Файл не передан" });
  }

  try {
    const { text } = await pdfParse(req.file.buffer);
    const weeks = parseWeeksFromText(text, CONFIG.WEEKS_TO_GENERATE);
    res.json({ weeks });
  } catch (error) {
    console.error("❌ Ошибка при распознавании счёта недель:", error);
    res.status(400).json({
      error: error.message || "Не удалось распознать файл",
    });
  }
});

app.post("/api/weeks/save", async (req, res) => {
  const weeks = req.body;
  if (!Array.isArray(weeks) || !weeks.length) {
    return res.status(400).json({ error: "Пустой или некорректный список недель" });
  }
  try {
    await fs.writeFile(CONFIG.WEEKS_FILE_PATH, JSON.stringify(weeks, null, 2), "utf-8");
    res.json({ ok: true });
  } catch (error) {
    console.error("❌ Ошибка при сохранении счёта недель:", error);
    res.status(500).json({ error: "Не удалось сохранить файл на сервере" });
  }
});

const FRONTEND_DIST = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(FRONTEND_DIST));
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, "index.html"));
});

app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({ error: "Критическая ошибка сервера" });
});

app.listen(CONFIG.PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${CONFIG.PORT}`);
});