<template>
  <div class="app-container">
    <header class="header">
      <div class="header-left">
        <svg class="header-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7v-5z" fill="var(--primary)"/>
        </svg>
        <div class="header-titles">
          <h1>Система «График дежурств»</h1>
          <p class="subtitle">Управление расписанием дежурств</p>
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
          Сессия (Зима)
        </button>
      </div>
    </header>

    <main>
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
          <h3>Полное расписание зимней сессии</h3>
          <span class="week-type">Все расписанные дни</span>
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
                      v-model="row[header]"
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
                <th :colspan="String(groupedData.length)" class="month-title">
                  {{ currentMonthName.toUpperCase() }}
                </th>
                <th :colspan="currentTab === 'semester' ? '2' : '1'" class="total-hours-label">
                  Всего часов
                </th>
              </tr>
              <tr>
                <th v-for="group in groupedData" :key="'date-' + group.dayLabel">
                  {{ getDayNumber(group.dayLabel) }}
                </th>
                <th class="sub-total-head">за неделю</th>
                <th v-if="currentTab === 'semester'" class="sub-total-head">в месяц</th>
              </tr>
            </thead>

            <tbody>
              <tr class="days-of-week-row">
                <td class="row-label-cell sticky-col">Дни недели</td>
                <td v-for="group in groupedData" :key="'row-day-' + group.dayLabel" class="day-name-cell">
                  {{ getShortDayName(group.dayLabel) }}
                </td>
                <td class="stats-week-range-label">{{ shortWeekRangeDisplay }}</td>
                <td v-if="currentTab === 'semester'">
                  <span style="text-transform: capitalize;">{{ currentMonthName }}</span>
                </td>
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
                <span>За неделю:</span>
                <strong>{{ formatHours(stats.weekTotal) }} ч.</strong>
              </div>
              <div class="total-row month" v-if="currentTab === 'semester'">
                <span style="text-transform: capitalize;">В месяц ({{ currentMonthName }}):</span>
                <strong>{{ formatHours(stats.monthTotal) }} ч.</strong>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script>
export default {
  data() {
    return {
      currentTab: "semester",
      schedule: { semester: [], session: [] },
      loading: true,
      error: null,
      currentDate: new Date(),
      selectedSurname: "",
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

      let filtered = [...data];

      // =====================================================
      // ОБРАБОТКА ЧИСЛИТЕЛЬ / ЗНАМЕНАТЕЛЬ
      // =====================================================
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

      // =====================================================
      // УДАЛЕНИЕ ПУСТЫХ СТРОК ДЛЯ ВСЕХ ВКЛАДОК
      // =====================================================
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

      // =====================================================
      // ФИЛЬТР ПО ФАМИЛИИ
      // =====================================================
      if (this.selectedSurname) {
        filtered = filtered.filter((row) =>
          Object.values(row).some((val) => {
            const str = String(val).trim();
            return str.toLowerCase().includes(this.selectedSurname.toLowerCase());
          })
        );
      }

      // =====================================================
      // ПОДГРУЗКА ЛОКАЛЬНЫХ ЗАМЕТОК
      // =====================================================
      const savedNotes = JSON.parse(localStorage.getItem("schedule_custom_notes") || "{}");

      filtered.forEach((row) => {
        const dayLabel = this.formatDayWithDate(row);
        const timeLabel = row["Часы"] || row["время"] || row["ВРЕМЯ"] || "";
        const uniqueKey = `${this.currentTab}_${dayLabel}_${timeLabel}`.trim().toLowerCase();

        const infoKey = this.getInfoKey(row);
        if (!row[infoKey]) row[infoKey] = "";

        if (savedNotes[uniqueKey] !== undefined) {
          row[infoKey] = savedNotes[uniqueKey];
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

    availableSurnames() {
      const data = this.currentTab === "semester" ? this.schedule.semester : this.schedule.session;
      const excludedColumns = ["дни нед.", "дни", "часы", "время", "пары", "информация", "information", "даты"];
      const names = new Set();
      data.forEach((row) => {
        Object.keys(row).forEach((key) => {
          if (excludedColumns.includes(key.toLowerCase().trim())) return;
          const value = row[key];
          if (value && value !== "—" && String(value).trim() !== "") {
            names.add(String(value).trim());
          }
        });
      });
      return [...names].sort();
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

        // Поиск ключа без учета регистра, чтобы не было дублей "Иванов" и "иванов"
        let pKey = Object.keys(result).find(k => k.toLowerCase() === person.toLowerCase());
        if (!pKey) {
          pKey = person;
          result[pKey] = { byDay: {}, weekTotal: 0, monthTotal: 0 };
        }

        if (dayLabel) {
          if (!result[pKey].byDay[dayLabel]) result[pKey].byDay[dayLabel] = 0;
          result[pKey].byDay[dayLabel] += hours;
        }

        if (mode === 'week' || mode === 'both') result[pKey].weekTotal += hours;
        if (mode === 'month' || mode === 'both') result[pKey].monthTotal += hours;
      };

      const parseInfoHours = (text, callback) => {
        if (!text || typeof text !== 'string') return;
        const regex = /([А-ЯЁa-z][а-яёa-z]+\s?[А-ЯЁa-z]?\.?(?:\sс\s\d{2}\.\d{2})?)[,\s]+(\d{1,2})[:.]?(\d{0,2})\s?[-–]\s?(\d{1,2})[:.]?(\d{0,2})/gi;
        let match;
        while ((match = regex.exec(text)) !== null) {
          const name = match[1].trim();
          const start = Number(match[2]) + Number(match[3] || 0) / 60;
          const end = Number(match[4]) + Number(match[5] || 0) / 60;
          const hours = end - start;
          if (hours > 0) callback(name, hours);
        }
      };

      // =====================================================
      // 1. РАСЧЕТ ЗА ТЕКУЩУЮ НЕДЕЛЮ (по отфильтрованным данным на экране)
      // =====================================================
      const processedWeekRows = new Set();

      this.filteredData.forEach((row) => {
        const dayLabel = this.formatDayWithDate(row);
        const timeLabel = row['Часы'] || row['время'] || row['ВРЕМЯ'] || '';
        const uniqueKey = `${dayLabel}_${timeLabel}`;

        if (processedWeekRows.has(uniqueKey)) return;
        processedWeekRows.add(uniqueKey);

        // Часы локаций за неделю
        const locKeys = this.getRowLocations(row);
        locKeys.forEach((loc) => {
          const person = normalizeName(row[loc]);
          if (person) addHours(person, dayLabel, pairHours, 'week');
        });

        // Часы из Информации за неделю
        const infoKey = this.getInfoKey(row);
        const infoText = row[infoKey] || '';
        parseInfoHours(infoText, (name, hours) => {
          addHours(name, dayLabel, hours, 'week');
        });
      });

      // =====================================================
      // 2. ГЛОБАЛЬНЫЙ РАСЧЕТ ЗА МЕСЯЦ
      // =====================================================
      if (this.currentTab === 'semester' && this.schedule.semester && this.schedule.semester.length) {
        const rawSemester = this.schedule.semester;
        const savedNotes = JSON.parse(localStorage.getItem("schedule_custom_notes") || "{}");
        
        const firstDay = new Date(targetYear, targetMonth, 1);
        const lastDay = new Date(targetYear, targetMonth + 1, 0);
        const dayNames = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

        for (let date = new Date(firstDay); date <= lastDay; date.setDate(date.getDate() + 1)) {
          if (date.getDay() === 0) continue; // Пропуск воскресений

          const currentWeekType = this.getWeekTypeByDate(date);
          const dayName = dayNames[date.getDay()];
          const validRows = [];

          // Поиск строк для данного дня месяца
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

          // Начисляем часы за месяц
          validRows.forEach((row) => {
            // Часы из сетки
            const locKeys = this.getRowLocations(row);
            locKeys.forEach((loc) => {
              const person = normalizeName(row[loc]);
              if (person) addHours(person, null, pairHours, 'month');
            });

            // Формируем ИДЕНТИЧНЫЙ ключ для поиска в localStorage
            const timeLabel = row['Часы'] || row['время'] || row['ВРЕМЯ'] || '';
            const capDayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
            const dateStr = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
            const exactDayLabel = `${capDayName} ${dateStr}`;
            
            const uniqueKey = `semester_${exactDayLabel}_${timeLabel}`.trim().toLowerCase();
            const infoText = savedNotes[uniqueKey] || "";

            parseInfoHours(infoText, (name, hours) => {
              addHours(name, null, hours, 'month');
            });
          });
        }
      } 
      else if (this.currentTab === "session" && this.schedule.session && this.schedule.session.length) {
        this.schedule.session.forEach(row => {
          if (row && row["даты"]) {
            const dateObj = this.parseExcelDate(row["даты"]);
            if (dateObj && dateObj.getMonth() === targetMonth && dateObj.getFullYear() === targetYear) {
              const locKeys = this.getRowLocations(row);
              locKeys.forEach((loc) => {
                const person = normalizeName(row[loc]);
                if (person) addHours(person, null, pairHours, 'month');
              });

              const timeLabel = row['Часы'] || row['время'] || row['ВРЕМЯ'] || '';
              const exactDayLabel = this.formatDayWithDate(row);
              const uniqueKey = `session_${exactDayLabel}_${timeLabel}`.trim().toLowerCase();
              const savedNotes = JSON.parse(localStorage.getItem("schedule_custom_notes") || "{}");
              const infoText = savedNotes[uniqueKey] || "";

              parseInfoHours(infoText, (name, hours) => {
                addHours(name, null, hours, 'month');
              });
            }
          }
        });
      }

      // =====================================================
      // ОКРУГЛЕНИЕ
      // =====================================================
      Object.values(result).forEach((stats) => {
        stats.weekTotal = Number(stats.weekTotal.toFixed(1));
        stats.monthTotal = Number(stats.monthTotal.toFixed(1));
        Object.keys(stats.byDay).forEach((day) => {
          stats.byDay[day] = Number(stats.byDay[day].toFixed(1));
        });
      });

      return result;
    },
  },

  methods: {
      async loadSchedule() {
        try {
          this.loading = true;
          const response = await fetch("/data.json");
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

    getWeekTypeByDate(date) {
      const semesterStart = new Date(2025, 8, 1);
      semesterStart.setHours(0, 0, 0, 0);

      const current = new Date(date);
      current.setHours(0, 0, 0, 0);

      const day = current.getDay();
      const diff = current.getDate() - day + (day === 0 ? -6 : 1);
      current.setDate(diff);

      const diffMs = current.getTime() - semesterStart.getTime();
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
        return row;
      });

      let lastDaySem = "";
      let lastTimeSem = "";
      data.semester = (data.semester || []).map((row) => {
        if (row["Дни нед."] !== undefined && row["Дни нед."] !== "") lastDaySem = row["Дни нед."];
        else row["Дни нед."] = lastDaySem;
        if (row["Часы"] !== undefined && row["Часы"] !== "") lastTimeSem = row["Часы"];
        else row["Часы"] = lastTimeSem;
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

    saveInformation(row) {
      const dayLabel = this.formatDayWithDate(row);
      const timeLabel = row['Часы'] || row['время'] || row['ВРЕМЯ'] || '';
      const uniqueKey = `${this.currentTab}_${dayLabel}_${timeLabel}`.trim().toLowerCase();

      const savedNotes = JSON.parse(localStorage.getItem('schedule_custom_notes') || '{}');
      const infoKey = this.getInfoKey(row);
      const value = row[infoKey] || '';

      if (value.trim() === '') {
        delete savedNotes[uniqueKey];
      } else {
        savedNotes[uniqueKey] = value;
      }

      localStorage.setItem('schedule_custom_notes', JSON.stringify(savedNotes));
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
  }
};
</script>

<style>
/* =========================================================
   RESET + BASE
========================================================= */
*, *::before, *::after { box-sizing: border-box; }

@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@700;800&display=swap");

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

/* =========================================================
   HEADER & CONTROLS
========================================================= */
.header { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.25rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-dark); }
.header-left { display: flex; align-items: center; gap: 0.75rem; }
.header-icon { width: clamp(2.5rem, 4vw, 3rem); height: clamp(2.5rem, 4vw, 3rem); flex-shrink: 0; }

.header-titles h1 {
  margin: 0;
  /* Возвращаем Inter — он строже, аккуратнее и отлично читается в меньшем размере */
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  /* Уменьшили размер: теперь диапазон от 1.1rem (на смартфонах) до 1.45rem (на ПК) */
  font-size: clamp(1.1rem, 2.8vw, 1.45rem); 
  font-weight: 700; /* Снизили плотность с 800 до 700, чтобы заголовок смотрелся легче */
  letter-spacing: -0.01em; 
  color: var(--text);
}

.subtitle { 
  margin-top: 0.25rem; 
  color: var(--text-soft); 
  font-size: clamp(0.8rem, 2vw, 0.875rem); 
  text-align: left; /* Четкое выравнивание подзаголовка по левому краю */
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

/* Обновленные кнопки переключения недель */
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

/* Эффекты при взаимодействии с кнопками */
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
/* =========================================================
   ТАБЛИЦЫ И СТИЛИ КОМПОНЕНТОВ
========================================================= */
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
</style>