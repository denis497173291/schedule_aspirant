<template>
  <div class="app-container">
    <header class="header">
      <div class="header-left">
        <svg class="header-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7v-5z" fill="var(--primary)"/>
        </svg>
        <div class="header-titles">
          <h1>График дежурств</h1>
        </div>
      </div>

      <div class="tabs">
        <button
          :class="{ active: currentTab === 'semester' }"
          @click="setTab('semester')"
        >
          Семестр
        </button>

        <button
          :class="{ active: currentTab === 'session' }"
          @click="setTab('session')"
        >
          Сессия
        </button>

        <button class="weeks-admin-toggle" @click="showWeeksAdmin = !showWeeksAdmin" title="Обновить счёт недель">
          ⚙ Счёт недель
        </button>

        <button class="weeks-admin-toggle" @click="showScheduleAdmin = !showScheduleAdmin" title="Обновить график дежурств">
          ⚙ График дежурств
        </button>
      </div>
    </header>

    <main>
      <section v-if="showWeeksAdmin" class="weeks-admin-card">
        <h3>Обновление счёта недель</h3>
        <p class="weeks-admin-hint">
          Загрузите PDF со счётом недель (тот же формат, что публикует деканат — с пояснением внизу вида
          «с ДД.ММ по ДД.ММ - ... занятия по числителю/знаменателю» и заголовком с учебным годом). Сайт
          возьмёт эту точку отсчёта и посчитает чередование недель дальше. Результат появится для
          проверки — ничего не применится, пока вы не нажмёте «Сохранить».
        </p>

        <input type="file" accept="application/pdf" @change="onWeeksFileSelected" :disabled="weeksParsing" />

        <div v-if="weeksParsing" class="weeks-admin-status">⏳ Распознаю таблицу…</div>
        <div v-if="weeksError" class="weeks-admin-error">❌ {{ weeksError }}</div>
        <div v-if="weeksSaveSuccess" class="weeks-admin-success">✅ Сохранено. Сайт использует новые даты.</div>

        <div v-if="weeksPreview && weeksPreview.length" class="weeks-admin-preview">
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Начало</th>
                <th>Конец</th>
                <th>Тип</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in weeksPreview" :key="w.week" :class="{ 'weeks-admin-row-warn': !w.type }">
                <td>{{ w.week }}</td>
                <td>{{ w.start }}</td>
                <td>{{ w.end }}</td>
                <td>{{ w.type || 'не определён' }}</td>
              </tr>
            </tbody>
          </table>
          <p class="weeks-admin-hint">
            Сверьте с оригиналом файла. Если что-то не сходится — не сохраняйте, а сообщите разработчику.
          </p>
          <div class="weeks-admin-actions">
            <button class="weeks-admin-save" @click="saveWeeksPreview" :disabled="weeksSaving">
              {{ weeksSaving ? 'Сохраняю…' : 'Сохранить' }}
            </button>
            <button class="weeks-admin-cancel" @click="weeksPreview = null">Отмена</button>
          </div>
        </div>
      </section>

      <section v-if="showScheduleAdmin" class="weeks-admin-card">
        <h3>Обновление графика дежурств</h3>
        <p class="weeks-admin-hint">
          Загрузите новый файл .xlsx (тот же формат — листы «семестр» и «сессия…»). Сайт сначала
          проверит, что в файле есть нужные листы и в них есть строки с расписанием, и только потом
          заменит рабочий файл. Если что-то не сойдётся — ничего не применится, покажу ошибку.
        </p>

        <input type="file" accept=".xlsx" @change="onScheduleFileSelected" :disabled="scheduleUploading" />

        <div v-if="scheduleUploading" class="weeks-admin-status">⏳ Проверяю и применяю файл…</div>
        <div v-if="scheduleUploadError" class="weeks-admin-error">❌ {{ scheduleUploadError }}</div>
        <div v-if="scheduleUploadSuccess" class="weeks-admin-success">
          ✅ Готово. Семестр: {{ scheduleUploadSuccess.semesterRows }} строк с расписанием, сессия
          («{{ scheduleUploadSuccess.sessionSheetName }}»): {{ scheduleUploadSuccess.sessionRows }} строк.
          Сайт уже показывает новые данные.
        </div>
      </section>

      <section class="controls-card">
        <div class="week-navigation" v-if="currentTab === 'semester'">
          <button class="nav-btn" @click="prevWeek">←</button>
          <div class="week-info">
            <h3>{{ weekRangeDisplay }}</h3>
            <span class="week-type">{{ weekTypeDisplay }}</span>
          </div>
          <button class="nav-btn" @click="nextWeek">→</button>
        </div>
        
        <div class="session-header-info" v-else>
          <h3>Расписание сессии</h3>
          <span class="week-type">{{ sessionRangeDisplay }}</span>
        </div>

        <div class="search-wrapper">
          <select v-model="selectedSurname" class="search-select">
            <option value="">Все фамилии</option>
            <option
              v-for="surname in availableSurnames"
              :key="surname"
              :value="surname"
            >
              {{ surname }}
            </option>
          </select>
        </div>
      </section>

      <div v-if="loading" class="loading">⏳ Загрузка данных...</div>
      <div v-else-if="error" class="error-state">❌ {{ error }}</div>

      <div v-else class="schedule-section">
        
        <div class="table-wrapper desktop-only">
          <table v-if="filteredData.length">
            <thead>
              <tr>
                <th v-for="header in visibleHeaders" :key="header">
                  {{ formatHeaderName(header) }}
                </th>
              </tr>
            </thead>

            <tbody 
              v-for="(group, gIndex) in groupedData" 
              :key="gIndex"
              :class="{ 'current-day-group': isToday(group.dayLabel) }"
            >
              <tr class="day-header">
                <td :colspan="visibleHeaders.length">
                  {{ group.dayLabel }} <span v-if="isToday(group.dayLabel)" class="today-badge">Сегодня</span>
                </td>
              </tr>

              <tr v-for="(row, rIndex) in group.rows" :key="rIndex">
                <td v-for="header in visibleHeaders" :key="header">
                  <template v-if="header === 'Информация' || header === 'Information'">
                    <input
                      type="text"
                      class="info-input"
                      v-model="row[getInfoKey(row)]"
                      @input="saveInformationDebounced(row)"
                      @change="saveInformation(row)"
                      placeholder="Добавить информацию..."
                    />
                  </template>
                  <template v-else>
                    {{ row[header] || "—" }}
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty-state">Нет данных для отображения</div>
        </div>

        <div class="schedule-mobile-cards mobile-only" v-if="filteredData.length">
          <div 
            v-for="(group, gIndex) in groupedData" 
            :key="'mob-group-' + gIndex"
            class="mobile-day-group"
            :class="{ 'current-day-group': isToday(group.dayLabel) }"
          >
            <div class="mobile-day-title">
              {{ group.dayLabel }}
              <span v-if="isToday(group.dayLabel)" class="today-badge">Сегодня</span>
            </div>

<div
  class="mobile-row-card"
  v-for="(row, rIndex) in group.rows.filter(row => {
    const locKeys = getRowLocations(row);

    const hasAnySurname = locKeys.some(
      key =>
        row[key] &&
        row[key] !== '—' &&
        String(row[key]).trim() !== ''
    );

    const hasTime =
      (row['Часы'] && String(row['Часы']).trim() !== '') ||
      (row['время'] && String(row['время']).trim() !== '') ||
      (row['ВРЕМЯ'] && String(row['ВРЕМЯ']).trim() !== '');

    return hasTime && hasAnySurname;
  })"
  :key="'mob-row-' + rIndex"
>
              <div class="mobile-card-top">
                <div class="mobile-time-block">
                  <span class="mobile-time-badge">
                    {{ row['Часы'] || row['время'] || row['ВРЕМЯ'] || 'Время не указано' }}
                  </span>
                </div>

<div class="mobile-card-locations-inline">
  <div
    class="loc-item"
    v-for="locKey in getRowLocations(row).filter(
      key =>
        row[key] &&
        String(row[key]).trim() !== '' &&
        String(row[key]).trim() !== '—'
    )"
    :key="locKey"
  >
    <span class="loc-name">{{ formatHeaderName(locKey) }}:</span>
    <span class="loc-val">{{ row[locKey] }}</span>
  </div>
</div>
              </div>

              <div class="mobile-card-info-box">
                <input
                  type="text"
                  class="info-input mobile-input"
                  v-model="row[getInfoKey(row)]"
                  @input="saveInformationDebounced(row)"
                  @change="saveInformation(row)"
                  placeholder="Добавить информацию..."
                />
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state mobile-only">Нет данных для отображения</div>
      </div>

      <section v-if="Object.keys(statisticsData).length" class="stats-card">
        <h2 class="stats-title">Статистика учета рабочего времени</h2>
        
        <div class="stats-table-wrapper desktop-only">
          <table class="stats-table">
            <thead>
              <tr class="stats-month-row">
                <th rowspan="2" class="header-main-label sticky-col">Фамилия / Даты</th>
                <th
                  v-for="mg in statsMonthHeaderGroups"
                  :key="'mh-' + mg.key"
                  :colspan="String(mg.count)"
                  class="month-title"
                >
                  {{ mg.label.toUpperCase() }}
                </th>
                <th :colspan="currentTab === 'semester' ? '2' : String(1 + sessionMonths.length)" class="total-hours-label">
                  Всего часов
                </th>
              </tr>
              <tr>
                <th v-for="group in groupedData" :key="'date-' + group.dayLabel">
                  {{ getDayNumber(group.dayLabel) }}
                </th>
                <th class="sub-total-head">{{ currentTab === 'session' ? 'за сессию' : 'за неделю' }}</th>
                <th v-if="currentTab === 'semester'" class="sub-total-head">в месяц</th>
                <th v-else v-for="m in sessionMonths" :key="'mth-' + m.key" class="sub-total-head">
                  {{ m.label }}
                </th>
              </tr>
            </thead>

            <tbody>
              <tr class="days-of-week-row">
                <td class="row-label-cell sticky-col">Дни недели</td>
                <td v-for="group in groupedData" :key="'row-day-' + group.dayLabel" class="day-name-cell">
                  {{ getShortDayName(group.dayLabel) }}
                </td>
                <td class="stats-week-range-label">{{ currentTab === 'session' ? '' : shortWeekRangeDisplay }}</td>
                <td v-if="currentTab === 'semester'">
                  <span style="text-transform: capitalize;">{{ currentMonthName }}</span>
                </td>
                <td v-else v-for="m in sessionMonths" :key="'mth-lbl-' + m.key"></td>
              </tr>

              <tr v-for="(stats, person) in statisticsData" :key="person">
                <td class="stats-name sticky-col">{{ person }}</td>
                <td v-for="group in groupedData" :key="'cell-' + group.dayLabel">
                  {{ stats.byDay[group.dayLabel] ? formatHours(stats.byDay[group.dayLabel]) : '' }}
                </td>
                <td class="stats-total">
                  {{ formatHours(stats.weekTotal) }}
                </td>
                <td v-if="currentTab === 'semester'" class="stats-month-total">
                  {{ formatHours(stats.monthTotal) }}
                </td>
                <td v-else v-for="m in sessionMonths" :key="'mval-' + m.key" class="stats-month-total">
                  {{ stats.byMonth && stats.byMonth[m.key] ? formatHours(stats.byMonth[m.key]) : '0' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="stats-mobile-cards mobile-only">
          <div class="stats-mobile-card" v-for="(stats, person) in statisticsData" :key="'mob-stats-' + person">
            <div class="card-person-name">{{ person }}</div>
            <div class="card-grid-data">
              <div class="card-data-row" v-for="group in groupedData" :key="'mob-stat-cell-' + group.dayLabel">
                <span class="card-date-label">
                  {{ getDayNumber(group.dayLabel) }} {{ getShortDayName(group.dayLabel) }}
                </span>
                <span class="card-hours-val">
                  {{ stats.byDay[group.dayLabel] ? formatHours(stats.byDay[group.dayLabel]) : '0' }}
                </span>
              </div>
            </div>
            <div class="card-totals">
              <div class="total-row">
                <span>{{ currentTab === 'session' ? 'За сессию:' : 'За неделю:' }}</span>
                <strong>{{ formatHours(stats.weekTotal) }} ч.</strong>
              </div>
              <div class="total-row month" v-if="currentTab === 'semester'">
                <span style="text-transform: capitalize;">В месяц ({{ currentMonthName }}):</span>
                <strong>{{ formatHours(stats.monthTotal) }} ч.</strong>
              </div>
              <div
                class="total-row month"
                v-else
                v-for="m in sessionMonths"
                :key="'mob-mtotal-' + m.key"
              >
                <span style="text-transform: capitalize;">{{ m.label }}:</span>
                <strong>{{ stats.byMonth && stats.byMonth[m.key] ? formatHours(stats.byMonth[m.key]) : '0' }} ч.</strong>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="app-footer">
      <p class="footer-credit">Дизайн, код и реализация — Токарев Денис Викторович</p>
      <div class="footer-contacts">
        <a href="https://vk.ru/denka49" target="_blank" rel="noopener noreferrer">ВКонтакте</a>
        <span class="footer-divider">·</span>
        <a href="https://t.me/ViktorovichDesign" target="_blank" rel="noopener noreferrer">Telegram</a>
        <span class="footer-divider">·</span>
        <a href="mailto:denis497173291@gmail.com">Email</a>
      </div>
      <p class="footer-note">По вопросам сотрудничества и доработок — пишите в любой из каналов выше</p>
    </footer>
  </div>
</template>

<script>
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, remove, onValue } from "firebase/database";

// Данные вашего проекта из Firebase-консоли (Project settings → General → Your apps)
const firebaseConfig = {
  apiKey: "AIzaSyB8ISLVy_HDp2NbRQKBQ35sStKlQP7GT_M",
  authDomain: "schedule-6d23f.firebaseapp.com",
  databaseURL: "https://schedule-6d23f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "schedule-6d23f",
  storageBucket: "schedule-6d23f.firebasestorage.app",
  messagingSenderId: "405275896557",
  appId: "1:405275896557:web:bedc810b71e88d9f5c3ae4"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const notesRef = ref(db, "schedule_custom_notes");

export default {
  data() {
    return {
      currentTab: "semester",
      schedule: { semester: [], session: [] },
      loading: true,
      error: null,
      currentDate: new Date(),
      selectedSurname: "",
      saveTimers: {},
      notes: {},
      weeksTable: [],
      showWeeksAdmin: false,
      weeksParsing: false,
      weeksSaving: false,
      weeksError: null,
      weeksPreview: null,
      weeksSaveSuccess: false,
      showScheduleAdmin: false,
      scheduleUploading: false,
      scheduleUploadError: null,
      scheduleUploadSuccess: null,
    };
  },

  computed: {
    currentWeekStart() {
      const d = new Date(this.currentDate);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      monday.setHours(0, 0, 0, 0);
      return monday;
    },

    currentWeekEnd() {
      const sunday = new Date(this.currentWeekStart);
      sunday.setDate(sunday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return sunday;
    },

    weekRangeDisplay() {
      const format = (d) =>
        d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
      return `${format(this.currentWeekStart)} — ${format(this.currentWeekEnd)}`;
    },

    shortWeekRangeDisplay() {
      const format = (d) => {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}.${month}`;
      };
      return `${format(this.currentWeekStart)}—${format(this.currentWeekEnd)}`;
    },

    weekTypeDisplay() {
      return this.getWeekTypeByDate(this.currentWeekStart);
    },

    currentMonthName() {
      return this.currentWeekStart.toLocaleDateString('ru-RU', { month: 'long' });
    },

    filteredData() {
      const data = this.currentTab === "semester" ? this.schedule.semester : this.schedule.session;
      if (!data || !data.length) return [];

      // копии строк (не оригиналы) — иначе ввод текста ломает автосохранение
      let filtered = data.map((row) => ({ ...row }));

      // числитель/знаменатель (только семестр)
      if (this.currentTab === "semester") {
        const processed = [];
        const TECHNICAL_COLUMNS = ["часы", "время", "дни нед.", "дни", "даты", "информация", "information"];

        const getDay = (r) => String(r["Дни нед."] || r["дни"] || r["ДНИ НЕД."] || "").toLowerCase().trim();
        const getTime = (r) => String(r["Часы"] || r["время"] || r["ВРЕМЯ"] || "").trim();

        for (let i = 0; i < filtered.length; i++) {
          const row = filtered[i];
          const prev = i > 0 ? filtered[i - 1] : null;

          const isDenominatorRow = prev && getTime(prev) === getTime(row) && getDay(prev) === getDay(row);
          if (isDenominatorRow) continue;

          const nextRow = i + 1 < filtered.length ? filtered[i + 1] : null;
          const hasDenominator = nextRow && getTime(nextRow) === getTime(row) && getDay(nextRow) === getDay(row);

          if (this.weekTypeDisplay === "Числитель") {
            processed.push({ ...row });
          } else {
            if (hasDenominator) {
              const merged = { ...row };
              Object.keys(merged).forEach((k) => {
                if (!TECHNICAL_COLUMNS.includes(k.toLowerCase().trim())) merged[k] = "";
              });
              Object.keys(nextRow).forEach((k) => {
                if (!TECHNICAL_COLUMNS.includes(k.toLowerCase().trim())) merged[k] = nextRow[k];
              });
              processed.push(merged);
            } else {
              processed.push({ ...row });
            }
          }
        }
        filtered = processed;
      }

      // убираем пустые строки (без времени/дня или без дежурного)
      filtered = filtered.filter((row) => {
        const hasTime = (row["Часы"] && String(row["Часы"]).trim() !== "") || 
                        (row["время"] && String(row["время"]).trim() !== "") ||
                        (row["ВРЕМЯ"] && String(row["ВРЕМЯ"]).trim() !== "");

        const hasDay = (row["Дни нед."] && String(row["Дни нед."]).trim() !== "") || 
                       (row["дни"] && String(row["дни"]).trim() !== "") ||
                       (row["ДНИ НЕД."] && String(row["ДНИ НЕД."]).trim() !== "");

        const locKeys = this.getRowLocations(row);
        const hasAnySurname = locKeys.some(key => row[key] && row[key] !== "—" && String(row[key]).trim() !== "");

        return (hasTime || hasDay) && hasAnySurname;
      });

      // фильтр по фамилии — только колонки с именами, чужие фамилии затираем
      if (this.selectedSurname) {
        const target = this.selectedSurname.trim().toLowerCase();
        const isMatch = (val) => val && String(val).trim().toLowerCase().includes(target);

        filtered = filtered
          .filter((row) => {
            const locKeys = this.getRowLocations(row);
            return locKeys.some((key) => isMatch(row[key]));
          })
          .map((row) => {
            const clone = { ...row };
            const locKeys = this.getRowLocations(clone);
            locKeys.forEach((key) => {
              if (!isMatch(clone[key])) clone[key] = "";
            });
            return clone;
          });
      }

      filtered.forEach((row) => {
        const dayLabel = this.formatDayWithDate(row);
        const timeLabel = row["Часы"] || row["время"] || row["ВРЕМЯ"] || "";
        const uniqueKey = this.sanitizeKey(`${this.currentTab}_${dayLabel}_${timeLabel}`.trim().toLowerCase());

        const infoKey = this.getInfoKey(row);
        if (!row[infoKey]) row[infoKey] = "";

        if (this.notes[uniqueKey] !== undefined) {
          row[infoKey] = this.notes[uniqueKey];
        }
      });

      return filtered;
    },

    visibleHeaders() {
      if (!this.filteredData.length) return [];
      const allKeysSet = new Set();
      this.filteredData.forEach(row => {
        Object.keys(row).forEach(key => allKeysSet.add(key));
      });
      const hiddenColumns = ["дни нед.", "дни", "даты", "дни нед"];
      const potentialHeaders = Array.from(allKeysSet).filter(
        (k) => !k.startsWith("__EMPTY") && !hiddenColumns.includes(k.toLowerCase().trim()) && k.toLowerCase().trim() !== "информация" && k.toLowerCase().trim() !== "information"
      );
      
      const headersWithData = potentialHeaders.filter((header) => {
        return this.filteredData.some((row) => {
          const val = row[header];
          return val !== undefined && val !== null && String(val).trim() !== "" && String(val).trim() !== "—";
        });
      });
      
      headersWithData.push("Информация");
      return headersWithData;
    },

    groupedData() {
      const map = new Map();
      this.filteredData.forEach((row) => {
        const label = this.formatDayWithDate(row);
        if (!label) return;
        if (!map.has(label)) map.set(label, []);
        map.get(label).push(row);
      });
      return Array.from(map, ([dayLabel, rows]) => ({ dayLabel, rows }));
    },

    // реальный диапазон дат сессии (первый и последний расписанный день)
    sessionRangeDisplay() {
      const dates = [];
      (this.schedule.session || []).forEach((row) => {
        const d = this.parseExcelDate(row["даты"]);
        if (!d) return;

        // учитываем только дни, где есть хотя бы один дежурный
        const locKeys = this.getRowLocations(row);
        const hasData = locKeys.some(
          (key) => row[key] && String(row[key]).trim() !== "" && String(row[key]).trim() !== "—"
        );
        if (!hasData) return;

        dates.push(d);
      });

      if (!dates.length) return "";

      const format = (d) =>
        d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

      const start = new Date(Math.min(...dates));
      const end = new Date(Math.max(...dates));

      return `${format(start)} — ${format(end)}`;
    },

    // реальные месяцы, встречающиеся в данных сессии
    sessionMonths() {
      if (this.currentTab !== "session") return [];
      const map = new Map();
      (this.schedule.session || []).forEach((row) => {
        const d = this.parseExcelDate(row["даты"]);
        if (!d) return;

        // пропускаем пустые дни (без единого дежурного)
        const locKeys = this.getRowLocations(row);
        const hasData = locKeys.some(
          (key) => row[key] && String(row[key]).trim() !== "" && String(row[key]).trim() !== "—"
        );
        if (!hasData) return;

        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            year: d.getFullYear(),
            month: d.getMonth(),
            label: d.toLocaleDateString("ru-RU", { month: "long" }),
          });
        }
      });
      return [...map.values()].sort((a, b) => a.year - b.year || a.month - b.month);
    },

    // группировка дней статистики по месяцам (для заголовка таблицы)
    statsMonthHeaderGroups() {
      const groups = [];
      this.groupedData.forEach((g) => {
        const match = g.dayLabel.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        let key = "unknown";
        let label = "";
        if (match) {
          key = `${match[3]}-${match[2]}`;
          label = new Date(Number(match[3]), Number(match[2]) - 1, 1).toLocaleDateString("ru-RU", { month: "long" });
        }
        const last = groups[groups.length - 1];
        if (last && last.key === key) {
          last.count += 1;
        } else {
          groups.push({ key, label, count: 1 });
        }
      });
      return groups;
    },

    availableSurnames() {
      // только из "именных" колонок (getRowLocations)
      const data = this.currentTab === "semester" ? this.schedule.semester : this.schedule.session;
      const names = new Set();
      data.forEach((row) => {
        const locKeys = this.getRowLocations(row);
        locKeys.forEach((key) => {
          const value = row[key];
          if (value && value !== "—" && String(value).trim() !== "") {
            names.add(String(value).trim());
          }
        });
      });
      return [...names].sort((a, b) => a.localeCompare(b, "ru"));
    },

    statisticsData() {
      const result = {};
      const pairHours = 1.5;
      const targetMonth = this.currentWeekStart.getMonth(); 
      const targetYear = this.currentWeekStart.getFullYear();

      const normalizeName = (value) => {
        if (!value) return null;
        const cleaned = String(value).trim();
        if (!cleaned || cleaned === '—') return null;
        return cleaned;
      };

      const addHours = (person, dayLabel, hours, mode = 'week') => {
        if (!person || hours <= 0) return;

        // без учёта регистра, чтобы не было дублей
        let pKey = Object.keys(result).find(k => k.toLowerCase() === person.toLowerCase());
        if (!pKey) {
          pKey = person;
          result[pKey] = { byDay: {}, weekTotal: 0, monthTotal: 0, byMonth: {} };
        }

        if (dayLabel) {
          if (!result[pKey].byDay[dayLabel]) result[pKey].byDay[dayLabel] = 0;
          result[pKey].byDay[dayLabel] += hours;
        }

        if (mode === 'week' || mode === 'both') result[pKey].weekTotal += hours;
        if (mode === 'month' || mode === 'both') result[pKey].monthTotal += hours;
      };

      // часы по конкретному месяцу (для сессии)
      const addHoursToMonth = (person, monthKey, hours) => {
        if (!person || hours <= 0 || !monthKey) return;
        let pKey = Object.keys(result).find(k => k.toLowerCase() === person.toLowerCase());
        if (!pKey) {
          pKey = person;
          result[pKey] = { byDay: {}, weekTotal: 0, monthTotal: 0, byMonth: {} };
        }
        if (!result[pKey].byMonth[monthKey]) result[pKey].byMonth[monthKey] = 0;
        result[pKey].byMonth[monthKey] += hours;
      };

      const parseInfoHours = (text, callback) => {
        if (!text || typeof text !== 'string') return;
        const regex = /([А-ЯЁa-z][а-яёa-z]+\s?[А-ЯЁa-z]?\.?)[,\s]+(\d{1,2})[:.]?(\d{0,2})\s?[-–]\s?(\d{1,2})[:.]?(\d{0,2})/gi;
        let match;
        while ((match = regex.exec(text)) !== null) {
          const name = match[1].trim();
          const start = Number(match[2]) + Number(match[3] || 0) / 60;
          const end = Number(match[4]) + Number(match[5] || 0) / 60;
          const hours = end - start;
          if (hours > 0) callback(name, hours);
        }
      };

      // 1. за текущую неделю
      const processedWeekRows = new Set();

      this.filteredData.forEach((row) => {
        const dayLabel = this.formatDayWithDate(row);
        const timeLabel = row['Часы'] || row['время'] || row['ВРЕМЯ'] || '';
        const uniqueKey = `${dayLabel}_${timeLabel}`;

        if (processedWeekRows.has(uniqueKey)) return;
        processedWeekRows.add(uniqueKey);

        const locKeys = this.getRowLocations(row);
        locKeys.forEach((loc) => {
          const person = normalizeName(row[loc]);
          if (person) addHours(person, dayLabel, pairHours, 'week');
        });

        const infoKey = this.getInfoKey(row);
        const infoText = row[infoKey] || '';
        parseInfoHours(infoText, (name, hours) => {
          addHours(name, dayLabel, hours, 'week');
        });
      });

      // 2. за месяц
      if (this.currentTab === 'semester' && this.schedule.semester && this.schedule.semester.length) {
        const rawSemester = this.schedule.semester;
        
        const firstDay = new Date(targetYear, targetMonth, 1);
        const lastDay = new Date(targetYear, targetMonth + 1, 0);
        const dayNames = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

        for (let date = new Date(firstDay); date <= lastDay; date.setDate(date.getDate() + 1)) {
          if (date.getDay() === 0) continue; // без воскресений

          const currentWeekType = this.getWeekTypeByDate(date);
          const dayName = dayNames[date.getDay()];
          const validRows = [];

          for (let i = 0; i < rawSemester.length; i++) {
            const row = rawSemester[i];
            const rowDay = String(row['Дни нед.'] || row['дни'] || row['ДНИ НЕД.'] || '').toLowerCase().trim();
            if (rowDay !== dayName) continue;

            const prev = i > 0 ? rawSemester[i - 1] : null;
            const next = i + 1 < rawSemester.length ? rawSemester[i + 1] : null;

            const currentTime = String(row['Часы'] || row['время'] || row['ВРЕМЯ'] || '').trim();
            const prevTime = prev ? String(prev['Часы'] || prev['время'] || prev['ВРЕМЯ'] || '').trim() : '';
            const nextTime = next ? String(next['Часы'] || next['время'] || next['ВРЕМЯ'] || '').trim() : '';

            const prevDay = prev ? String(prev['Дни нед.'] || prev['дни'] || prev['ДНИ НЕД.'] || '').toLowerCase().trim() : '';
            const nextDay = next ? String(next['Дни нед.'] || next['дни'] || next['ДНИ НЕД.'] || '').toLowerCase().trim() : '';

            const isDenominator = prev && prevTime === currentTime && prevDay === rowDay;
            const hasDenominator = next && nextTime === currentTime && nextDay === rowDay;

            if (currentWeekType === 'Числитель') {
              if (!isDenominator) validRows.push(row);
            } else {
              if (hasDenominator) validRows.push(next);
              else if (!isDenominator) validRows.push(row);
            }
          }

          validRows.forEach((row) => {
            const locKeys = this.getRowLocations(row);
            locKeys.forEach((loc) => {
              const person = normalizeName(row[loc]);
              if (person) addHours(person, null, pairHours, 'month');
            });

            // ключ как при сохранении заметки
            const timeLabel = row['Часы'] || row['время'] || row['ВРЕМЯ'] || '';
            const capDayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
            const dateStr = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
            const exactDayLabel = `${capDayName} ${dateStr}`;
            
            const uniqueKey = this.sanitizeKey(`semester_${exactDayLabel}_${timeLabel}`.trim().toLowerCase());
            const infoText = this.notes[uniqueKey] || "";

            parseInfoHours(infoText, (name, hours) => {
              addHours(name, null, hours, 'month');
            });
          });
        }
      } 
      else if (this.currentTab === "session" && this.schedule.session && this.schedule.session.length) {
        // по каждому реальному месяцу сессии, а не только по текущему
        this.schedule.session.forEach(row => {
          if (row && row["даты"]) {
            const dateObj = this.parseExcelDate(row["даты"]);
            if (dateObj) {
              const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}`;

              const locKeys = this.getRowLocations(row);
              locKeys.forEach((loc) => {
                const person = normalizeName(row[loc]);
                if (person) addHoursToMonth(person, monthKey, pairHours);
              });

              const timeLabel = row['Часы'] || row['время'] || row['ВРЕМЯ'] || '';
              const exactDayLabel = this.formatDayWithDate(row);
              const uniqueKey = this.sanitizeKey(`session_${exactDayLabel}_${timeLabel}`.trim().toLowerCase());
              const infoText = this.notes[uniqueKey] || "";

              parseInfoHours(infoText, (name, hours) => {
                addHoursToMonth(name, monthKey, hours);
              });
            }
          }
        });
      }

      // округление
      Object.values(result).forEach((stats) => {
        stats.weekTotal = Number(stats.weekTotal.toFixed(1));
        stats.monthTotal = Number(stats.monthTotal.toFixed(1));
        Object.keys(stats.byDay).forEach((day) => {
          stats.byDay[day] = Number(stats.byDay[day].toFixed(1));
        });
        Object.keys(stats.byMonth || {}).forEach((m) => {
          stats.byMonth[m] = Number(stats.byMonth[m].toFixed(1));
        });
      });

      // сортировка по алфавиту
      const sortedResult = {};
      Object.keys(result)
        .sort((a, b) => a.localeCompare(b, "ru"))
        .forEach((key) => {
          sortedResult[key] = result[key];
        });

      // если выбрана фамилия — оставляем в статистике только её
      if (this.selectedSurname) {
        const target = this.selectedSurname.trim().toLowerCase();
        const onlySelected = {};
        Object.keys(sortedResult).forEach((key) => {
          if (key.toLowerCase().includes(target)) {
            onlySelected[key] = sortedResult[key];
          }
        });
        return onlySelected;
      }

      return sortedResult;
    },
  },

  methods: {
      async loadSchedule() {
        try {
          this.loading = true;
          const response = await fetch("/api/schedule");
          if (!response.ok) throw new Error("Ошибка загрузки");
          const data = await response.json();
          this.schedule = this.preprocessData(data);
          this.setInitialDateForTab(this.currentTab);
        } catch (err) {
          this.error = "Не удалось подключиться к серверу";
        } finally {
          this.loading = false;
        }
      },

      // грузим файл "Счёт недель"; если его ещё нет на сервере — не страшно,
      // просто продолжаем работать по запасному расчёту в getWeekTypeByDate
      async loadWeeks() {
        try {
          const response = await fetch("/api/weeks");
          if (!response.ok) return;
          const data = await response.json();
          this.weeksTable = (data || [])
            .map((item) => ({
              start: this.parseExcelDate(item.start),
              end: this.parseExcelDate(item.end),
              type: item.type,
            }))
            .filter((w) => w.start && w.end && w.type);
        } catch (err) {
          // сервер недоступен или файла нет — не критично
        }
      },

      async onWeeksFileSelected(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        this.weeksError = null;
        this.weeksSaveSuccess = false;
        this.weeksPreview = null;
        this.weeksParsing = true;

        try {
          const formData = new FormData();
          formData.append("file", file);
          const response = await fetch("/api/weeks/parse", { method: "POST", body: formData });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Не удалось распознать файл");
          this.weeksPreview = result.weeks;
        } catch (err) {
          this.weeksError = err.message;
        } finally {
          this.weeksParsing = false;
          event.target.value = "";
        }
      },

      async saveWeeksPreview() {
        if (!this.weeksPreview || !this.weeksPreview.length) return;
        this.weeksSaving = true;
        this.weeksError = null;

        try {
          const response = await fetch("/api/weeks/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(this.weeksPreview),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Не удалось сохранить");
          this.weeksSaveSuccess = true;
          this.weeksPreview = null;
          await this.loadWeeks();
        } catch (err) {
          this.weeksError = err.message;
        } finally {
          this.weeksSaving = false;
        }
      },

      async onScheduleFileSelected(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        if (!window.confirm("Заменить действующий график дежурств этим файлом? Отменить будет можно, только заново загрузив старый файл.")) {
          event.target.value = "";
          return;
        }

        this.scheduleUploadError = null;
        this.scheduleUploadSuccess = null;
        this.scheduleUploading = true;

        try {
          const formData = new FormData();
          formData.append("file", file);
          const response = await fetch("/api/schedule/upload", { method: "POST", body: formData });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Не удалось загрузить файл");
          this.scheduleUploadSuccess = result;
          await this.loadSchedule();
        } catch (err) {
          this.scheduleUploadError = err.message;
        } finally {
          this.scheduleUploading = false;
          event.target.value = "";
        }
      },

    getWeekTypeByDate(date) {
      const current = new Date(date);
      current.setHours(0, 0, 0, 0);

      // сначала ищем в загруженном файле "Счёт недель"
      if (this.weeksTable && this.weeksTable.length) {
        const found = this.weeksTable.find((w) => current >= w.start && current <= w.end);
        if (found) return found.type;
      }

      // запасной расчёт — если для этой даты в файле недели не нашлось
      const day = current.getDay();
      const diff = current.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(current);
      monday.setDate(diff);

      const semesterStart = new Date(2025, 8, 1);
      semesterStart.setHours(0, 0, 0, 0);

      const diffMs = monday.getTime() - semesterStart.getTime();
      const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));

      return diffWeeks % 2 === 0 ? 'Числитель' : 'Знаменатель';
    },

    setTab(tab) {
      this.currentTab = tab;
      this.setInitialDateForTab(tab);
    },

    setInitialDateForTab(tab) {
      if (tab === "session" && this.schedule.session.length) {
        const firstDateVal = this.schedule.session[0]["даты"];
        const parsed = this.parseExcelDate(firstDateVal);
        if (parsed) this.currentDate = parsed;
      } else {
        this.currentDate = new Date();
      }
    },

    prevWeek() {
      const d = new Date(this.currentDate);
      d.setDate(d.getDate() - 7);
      this.currentDate = d;
    },

    nextWeek() {
      const d = new Date(this.currentDate);
      d.setDate(d.getDate() + 7);
      this.currentDate = d;
    },

    preprocessData(data) {
      // сотрудники, полностью скрытые из графика и статистики
      const EXCLUDED_NAMES = ["белая"];

      const stripExcludedNames = (row) => {
        this.getRowLocations(row).forEach((key) => {
          const val = row[key];
          if (val && EXCLUDED_NAMES.includes(String(val).trim().toLowerCase())) {
            row[key] = "";
          }
        });
      };

      let lastDate = "";
      let lastDay = "";
      data.session = (data.session || []).map((row) => {
        if (row["даты"] !== undefined && row["даты"] !== "") lastDate = row["даты"];
        else row["даты"] = lastDate;
        if (row["дни"] !== undefined && row["дни"] !== "") lastDay = row["дни"];
        else row["дни"] = lastDay;
        if (row["Воснесенский"] !== undefined) {
          row["Вознесенский"] = row["Воснесенский"];
          delete row["Воснесенский"];
        }
        stripExcludedNames(row);
        return row;
      });

      let lastDaySem = "";
      let lastTimeSem = "";
      data.semester = (data.semester || []).map((row) => {
        if (row["Дни нед."] !== undefined && row["Дни нед."] !== "") lastDaySem = row["Дни нед."];
        else row["Дни нед."] = lastDaySem;
        if (row["Часы"] !== undefined && row["Часы"] !== "") lastTimeSem = row["Часы"];
        else row["Часы"] = lastTimeSem;
        stripExcludedNames(row);
        return row;
      });
      return data;
    },

    parseExcelDate(excelDate) {
      if (!excelDate) return null;
      if (typeof excelDate === "number") {
        const utcDays = Math.floor(excelDate - 25569);
        return new Date(utcDays * 86400 * 1000);
      }
      if (typeof excelDate === "string") {
        const parts = excelDate.split(".");
        if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
        const d = new Date(excelDate);
        if (!isNaN(d.getTime())) return d;
      }
      return null;
    },

    formatHeaderName(name) {
      if (!name) return "";
      const lower = name.toLowerCase().trim();
      const map = { часы: "Время", время: "Время", пары: "Пара", "информация": "Информация", "information": "Информация" };
      if (map[lower]) return map[lower];
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    },

    formatDayWithDate(row) {
      const dayName = row["Дни нед."] || row["дни"] || row["ДНИ НЕД."] || "";
      if (!dayName) return "";
      const normalizedDay = String(dayName).toLowerCase().trim();
      const capitalizedDay = normalizedDay.charAt(0).toUpperCase() + normalizedDay.slice(1);

      if (this.currentTab === "session" && row["даты"]) {
        const parsedDate = this.parseExcelDate(row["даты"]);
        if (parsedDate) {
          return `${capitalizedDay} ${parsedDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
        }
      }

      const days = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
      const dayIndex = days.indexOf(normalizedDay);
      if (dayIndex !== -1) {
        const d = new Date(this.currentWeekStart);
        const offset = dayIndex === 0 ? 6 : dayIndex - 1;
        d.setDate(d.getDate() + offset);
        return `${capitalizedDay} ${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
      }
      return capitalizedDay;
    },

    getDayNumber(dayLabel) {
      if (!dayLabel) return "";
      const match = dayLabel.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      return match ? match[1] : dayLabel;
    },

    getShortDayName(dayLabel) {
      if (!dayLabel) return "";
      const lower = dayLabel.toLowerCase();
      if (lower.includes("понедельник")) return "пн";
      if (lower.includes("вторник")) return "вт";
      if (lower.includes("среда")) return "ср";
      if (lower.includes("четверг")) return "чт";
      if (lower.includes("пятница")) return "пт";
      if (lower.includes("суббота")) return "сб";
      if (lower.includes("воскресенье")) return "вс";
      return dayLabel.slice(0, 2);
    },

    isToday(dayLabel) {
      if (!dayLabel) return false;
      const todayStr = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
      return dayLabel.includes(todayStr);
    },

    // автосохранение с задержкой (без ухода из поля)
    saveInformationDebounced(row) {
      const key = this.getRowSaveKey(row);
      clearTimeout(this.saveTimers[key]);
      this.saveTimers[key] = setTimeout(() => {
        this.saveInformation(row);
      }, 500);
    },

    getRowSaveKey(row) {
      const dayLabel = this.formatDayWithDate(row);
      const timeLabel = row['Часы'] || row['время'] || row['ВРЕМЯ'] || '';
      return `${this.currentTab}_${dayLabel}_${timeLabel}`.trim().toLowerCase();
    },

    // Firebase не разрешает точки, #, $, [, ], / в ключах — заменяем на дефис
    sanitizeKey(key) {
      return String(key).replace(/[.#$[\]/]/g, "-");
    },

    saveInformation(row) {
      const uniqueKey = this.sanitizeKey(this.getRowSaveKey(row));
      const infoKey = this.getInfoKey(row);
      const value = row[infoKey] || '';

      const noteRef = ref(db, `schedule_custom_notes/${uniqueKey}`);
      const request = value.trim() === '' ? remove(noteRef) : set(noteRef, value);

      request.catch((err) => {
        console.error('Не удалось сохранить заметку:', err);
      });
    },

    formatHours(hours) {
      if (!hours || hours <= 0) return "0";
      return Number(hours.toFixed(1)).toString().replace(".", ",");
    },

    // Поиск ключей
    getInfoKey(row) {
      if (!row) return "Информация";
      return Object.keys(row).find(k => {
        const l = k.toLowerCase().trim();
        return l === "информация" || l === "information";
      }) || "Информация";
    },

    getRowLocations(row) {
      if (!row) return [];
      const targets = ["джамбула", "вознесенский", "джамбула доп.", "воснесенский"];
      return Object.keys(row).filter(key => targets.includes(key.toLowerCase().trim()));
    }
  },
  
  mounted() {
    this.loadSchedule();
    this.loadWeeks();

    // подписка на заметки в реальном времени — обновляется у всех устройств сразу
    onValue(notesRef, (snapshot) => {
      this.notes = snapshot.val() || {};
    });
  }
};
</script>

<style>
/* RESET + BASE */

@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@700;800&display=swap");
*, *::before, *::after { box-sizing: border-box; }
:root {
  --bg: #f1f5f9;
  --surface: #ffffff;
  --surface-soft: #f8fafc;
  --border: #e2e8f0;
  --border-dark: #cbd5e1;
  --text: #0f172a;
  --text-soft: #64748b;
  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  --radius: 0.75rem;
  --container: 1440px;
}

html { font-size: 15px; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased; overflow-x: hidden;
}

.app-container {
  width: 100%; max-width: var(--container); margin: 0 auto;
  padding: clamp(0.5rem, 1.5vw, 1.5rem); overflow-x: hidden;
}

/* HEADER & CONTROLS */
.header { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.25rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-dark); }
.header-left { display: flex; align-items: center; gap: 0.75rem; }
.header-icon { width: clamp(2.5rem, 4vw, 3rem); height: clamp(2.5rem, 4vw, 3rem); flex-shrink: 0; }

.header-titles h1 {
  margin: 0;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: clamp(1.1rem, 2.8vw, 1.45rem); 
  font-weight: 700;
  letter-spacing: -0.01em; 
  color: var(--text);
}

.tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; width: 100%; }
.tabs button {
  width: 100%; min-height: 40px; border: none; border-radius: 0.5rem;
  padding: 0.6rem 1rem; background: #e2e8f0; color: #334155;
  font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.tabs button.active { background: var(--primary); color: white; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2); }

.controls-card {
  display: flex; flex-direction: column; gap: 0.75rem; background: var(--surface);
  border-radius: var(--radius); padding: 0.875rem; margin-bottom: 1.25rem; box-shadow: var(--shadow);
}
.week-navigation { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.week-info h3 { margin: 0; font-size: clamp(0.95rem, 2vw, 1.1rem); font-weight: 700; text-align: center; }
.week-type { display: block; text-align: center; margin-top: 0.15rem; color: var(--text-soft); font-size: 0.8rem; }

.nav-btn { 
  width: 40px; 
  height: 40px; 
  border: 1px solid var(--border); 
  border-radius: 0.5rem; 
  background: var(--surface-soft); 
  color: var(--text-soft); 
  font-weight: 700; 
  cursor: pointer; 
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease-in-out; 
}

.nav-btn:hover {
  background: var(--border); 
  color: var(--primary); 
  border-color: var(--border-dark);
}

.nav-btn:active {
  transform: scale(0.95); 
}

.search-select {
  width: 100%;
  min-height: 40px;
  border-radius: 0.5rem;
  border: 1px solid var(--border-dark);
  padding: 0 0.75rem;
  font-size: 0.9rem;
  background: #fff;
  color: #000000;
}
.search-select option {
  color: #000000;
}
/* ТАБЛИЦЫ И СТИЛИ КОМПОНЕНТОВ */
.table-wrapper { width: 100%; overflow-x: auto; border-radius: var(--radius); background: white; box-shadow: var(--shadow); }
table { width: 100%; border-collapse: collapse; }
thead th { position: sticky; top: 0; z-index: 5; background: var(--surface-soft); color: #475569; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; padding: 0.75rem; }
td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.875rem; white-space: nowrap; }
.day-header td { background: #e2e8f0 !important; font-weight: 700; color: var(--text); }
.current-day-group .day-header td { background: #eff6ff !important; color: var(--primary); }
.today-badge { margin-left: 0.5rem; padding: 0.15rem 0.4rem; border-radius: 4px; background: var(--primary); color: white; font-size: 0.65rem; }

.info-input {
  width: 100%; min-width: 260px; max-width: 100%; min-height: 34px;
  border-radius: 0.375rem; border: 1px solid #cbd5e1; background: #fdfdfd;
  padding: 0.4rem 0.6rem; font-size: 0.85rem; color: var(--text); transition: all 0.2s;
}
.info-input:focus { outline: none; background: #ffffff; border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
.info-input::placeholder { color: #94a3b8; }

/* КАРТОЧКИ СТАТИСТИКИ */
.stats-card { background: var(--surface); padding: 1rem; border-radius: var(--radius); margin-top: 1.5rem; box-shadow: var(--shadow); }
.stats-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0 0 1rem 0;
  color: #000000;
}
.stats-table-wrapper { overflow-x: auto; }
.stats-table { width: 100%; border-collapse: collapse; text-align: center; }
.stats-table th, .stats-table td { padding: 0.5rem; border: 1px solid var(--border); font-size: 0.85rem; }
.sticky-col { position: sticky; left: 0; background: white; z-index: 2; font-weight: 600; text-align: left; }
.stats-month-row th { background: var(--surface-soft); }
.stats-total { font-weight: 700; background: #f8fafc; }
.stats-month-total { font-weight: 700; background: #f0fdf4; color: #166534; }
.loading, .error-state, .empty-state { padding: 2rem; text-align: center; font-weight: 600; color: var(--text-soft); }

/* АДАПТИВНОСТЬ И МОБИЛЬНАЯ ВЕРСИЯ */
.mobile-only { display: none; }
.desktop-only { display: block; }

@media (max-width: 768px) {
  .desktop-only { display: none; }
  .mobile-only { display: block; }
  .tabs { grid-template-columns: 1fr 1fr; }
  
  .mobile-day-group { background: white; border-radius: var(--radius); margin-bottom: 1rem; padding: 0.75rem; box-shadow: var(--shadow); }
  .mobile-day-title { font-weight: 700; font-size: 1rem; color: var(--primary); padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); margin-bottom: 0.5rem; }
  .mobile-row-card { background: var(--surface-soft); border-radius: 0.5rem; padding: 0.75rem; margin-bottom: 0.5rem; border: 1px solid var(--border); }
  .mobile-card-top {
    display: flex;
    align-items: flex-start;
    gap: 0.9rem;
    margin-bottom: 0.75rem;
  }
  .mobile-time-block {flex-shrink: 0;}
  .mobile-time-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 92px;
    padding: 0.55rem 0.7rem;
    border-radius: 0.55rem;
    background: #e2e8f0;
    font-weight: 700;
    font-size: 0.9rem;
    color: #0f172a;
  }
  .mobile-card-locations-inline {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.45rem;
    flex: 1;
    min-width: 0;
  }
  .mobile-pair-badge { font-size: 0.8rem; color: var(--text-soft); }
  .mobile-card-locations { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.5rem; }
  .loc-item {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    line-height: 1.35;
    font-size: 0.92rem;
  }
  .loc-name {
    color: var(--text-soft);
  }

  .loc-val {
    font-weight: 700;
    color: var(--text);
  }
  .mobile-card-info-box { display: flex; flex-direction: column; gap: 0.25rem; }
  .mobile-input { min-width: 100%; }

  /* Стили для мобильной статистики */
  .stats-mobile-card { background: white; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.75rem; margin-bottom: 0.75rem; box-shadow: var(--shadow); }
  .card-person-name { font-weight: 700; font-size: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.4rem; margin-bottom: 0.5rem; }
  .card-grid-data { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; margin-bottom: 0.5rem; }
  .card-data-row { display: flex; justify-content: space-between; font-size: 0.8rem; background: var(--surface-soft); padding: 0.3rem; border-radius: 4px; }
  .card-date-label { color: var(--text-soft); }
  .card-hours-val { font-weight: 600; }
  .card-totals { border-top: 1px solid var(--border); padding-top: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
  .total-row { display: flex; justify-content: space-between; }
  .total-row.month { color: #166534; }
}

/* ПОДВАЛ */
.app-footer {
  margin-top: 2rem;
  padding: 1.25rem 1rem 0.5rem;
  border-top: 1px solid var(--border-dark);
  text-align: center;
}

.footer-credit {
  margin: 0 0 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}

.footer-contacts {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.footer-contacts a {
  color: var(--primary);
  font-weight: 600;
  font-size: 0.85rem;
  text-decoration: none;
}

.footer-contacts a:hover {
  text-decoration: underline;
}

.footer-divider {
  color: var(--border-dark);
  font-size: 0.85rem;
}

.footer-note {
  margin: 0 0 0.75rem;
  font-size: 0.75rem;
  color: var(--text-soft);
}

/* СЧЁТ НЕДЕЛЬ */
.weeks-admin-toggle {
  grid-column: 1 / -1;
  background: transparent;
  border: 1px dashed var(--border-dark);
  color: var(--text-soft);
  font-weight: 500;
}
.weeks-admin-toggle:hover { color: var(--primary); border-color: var(--primary); }

.weeks-admin-card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 1rem;
  margin-bottom: 1.25rem;
  box-shadow: var(--shadow);
  border: 1px dashed var(--border-dark);
}
.weeks-admin-card h3 { margin: 0 0 0.5rem; font-size: 1rem; }
.weeks-admin-hint { color: var(--text-soft); font-size: 0.85rem; margin-bottom: 0.75rem; }
.weeks-admin-status { margin-top: 0.75rem; color: var(--text-soft); }
.weeks-admin-error { margin-top: 0.75rem; color: #b91c1c; font-weight: 600; }
.weeks-admin-success { margin-top: 0.75rem; color: #166534; font-weight: 600; }
.weeks-admin-preview { margin-top: 1rem; }
.weeks-admin-preview table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.weeks-admin-preview th, .weeks-admin-preview td { border: 1px solid var(--border); padding: 0.4rem 0.6rem; text-align: left; }
.weeks-admin-row-warn td { background: #fef3c7; }
.weeks-admin-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.weeks-admin-save { background: var(--primary); color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; }
.weeks-admin-cancel { background: var(--surface-soft); border: 1px solid var(--border); padding: 0.5rem 1rem; border-radius: 0.5rem; cursor: pointer; }
</style>