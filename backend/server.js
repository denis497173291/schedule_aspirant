const express = require("express");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs").promises;
const cors = require("cors");

// ==========================================
// КОНФИГУРАЦИЯ И КОНСТАНТЫ
// ==========================================
const CONFIG = {
  PORT: process.env.PORT || 3000,
  FILE_PATH: path.join(__dirname, "График_дежурств.xlsx"),
  SHEETS: {
    SEMESTER: "семестр", // Оставляем точное совпадение для семестра
    SESSION_PREFIX: "сессия", // Ищем страницу, которая начинается с этого слова
  },
};

const COLS = {
  DAY: ["Дни нед.", "День", "день"],
  TIME: ["Часы", "время", "Время"],
  DUTY: ["Джамбула", "Вознесенский", "Воснесенский", "Джамбула доп."],
};

// ==========================================
// УТИЛИТЫ (DRY)
// ==========================================
/**
 * Извлекает значение из строки по массиву возможных ключей
 */
const extractValue = (row, possibleKeys) => {
  const key = possibleKeys.find((k) => row[k] !== undefined);
  return key ? String(row[key]).trim() : "";
};

/**
 * Проверяет, есть ли дежурные в строке
 */
const hasDutyAssigned = (row) => {
  return COLS.DUTY.some((key) => String(row[key] || "").trim() !== "");
};

// ==========================================
// БИЗНЕС-ЛОГИКА (Single Responsibility)
// ==========================================
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

      // Игнорируем пустые строки без расписания
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
        // Новый блок времени
        const existingBlock = currentDayBlocks.find((b) => b.time === time);
        
        if (!existingBlock) {
          currentDayBlocks.push({ time, num: { ...row }, den: null });
        } else if (hasDuty) {
          // Распределение по числителю/знаменателю
          if (!existingBlock.num) {
            existingBlock.num = { ...row };
          } else if (!existingBlock.den) {
            existingBlock.den = { ...row, "Часы": "" };
          }
        }
      } else if (currentDayBlocks.length > 0) {
        // Строка без времени -> Знаменатель для последнего блока
        const lastBlock = currentDayBlocks[currentDayBlocks.length - 1];
        if (!lastBlock.den) {
          const dayKey = COLS.DAY.find(k => row[k] !== undefined) || "Дни нед.";
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
          // Генерация пустой заглушки для знаменателя
          const baseRow = block.num || {};
          const dayKey = COLS.DAY.find(k => baseRow[k] !== undefined) || "Дни нед.";
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
        const dayKey = COLS.DAY.find(k => row[k] !== undefined) || "День";
        row[dayKey] = currentDay;
      }

      sessionData.push(row);
    }

    return sessionData;
  }
}

// ==========================================
// СЕРВИС ДАННЫХ (Кэширование и I/O)
// ==========================================
class ScheduleService {
  constructor(filePath) {
    this.filePath = filePath;
    this.cache = null;
    this.lastModifiedTime = 0;
  }

  async getSchedule() {
    try {
      const stats = await fs.stat(this.filePath);
      
      // Возвращаем кэш, если файл не изменялся
      if (this.cache && stats.mtimeMs === this.lastModifiedTime) {
        return this.cache;
      }

      console.log("📖 Чтение и парсинг Excel файла...");
      const fileBuffer = await fs.readFile(this.filePath);
      const workbook = xlsx.read(fileBuffer, { type: "buffer" });

      // 1. Поиск страницы семестра
      const semesterSheet = workbook.Sheets[CONFIG.SHEETS.SEMESTER];

      // 2. ДИНАМИЧЕСКИЙ ПОИСК СТРАНИЦЫ СЕССИИ
      // Ищем имя страницы, которое (приведенное к нижнему регистру) начинается со слова "сессия"
      const dynamicSessionSheetName = workbook.SheetNames.find(name => 
        name.toLowerCase().startsWith(CONFIG.SHEETS.SESSION_PREFIX)
      );

      // Получаем саму страницу, если она найдена
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
      if (error.code === 'ENOENT') {
        throw new Error("EXCEL_NOT_FOUND");
      }
      throw error;
    }
  }
}

// ==========================================
// ИНИЦИАЛИЗАЦИЯ EXPRESS
// ==========================================
const app = express();
const scheduleService = new ScheduleService(CONFIG.FILE_PATH);

app.use(cors());
app.use(express.json());

// Маршрут получения расписания
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

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({ error: "Критическая ошибка сервера" });
});

app.listen(CONFIG.PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${CONFIG.PORT}`);
});