/**
 * 调度器模块
 * 判断交易时段和休假日
 */

export class Scheduler {
  constructor(config) {
    this.config = config;
  }

  /**
   * 获取当前开市的市场
   */
  getOpenMarkets(now = new Date()) {
    const markets = this.config.getAllMarkets();
    const openMarkets = [];

    for (const market of markets) {
      if (this.isMarketOpen(market, now)) {
        openMarkets.push(market);
      }
    }

    return openMarkets;
  }

  /**
   * 判断市场是否开市
   */
  isMarketOpen(market, now = new Date()) {
    // 检查是否为休假日
    if (this.isHoliday(market, now)) {
      return false;
    }

    // 检查是否为周末
    if (this.isWeekend(market, now)) {
      return false;
    }

    // 检查是否在交易时段内
    return this.isInTradingHours(market, now);
  }

  /**
   * 判断是否为休假日
   */
  isHoliday(market, now = new Date()) {
    const holidays = this.config.getHolidays(market);
    const dateStr = this.formatDate(now, market);
    return holidays.includes(dateStr);
  }

  /**
   * 判断是否为周末
   */
  isWeekend(market, now = new Date()) {
    const day = now.getDay();
    const marketConfig = this.config.getMarketConfig(market);

    // 获取市场时区
    const timezone = marketConfig.timezone || 'Asia/Shanghai';

    // 转换为市场时区
    const marketDate = this.toMarketTime(now, timezone);
    const marketDay = marketDate.getDay();

    // 周六(6)或周日(0)为周末
    return marketDay === 0 || marketDay === 6;
  }

  /**
   * 判断是否在交易时段内
   */
  isInTradingHours(market, now = new Date()) {
    const marketConfig = this.config.getMarketConfig(market);
    const timezone = marketConfig.timezone || 'Asia/Shanghai';

    // 转换为市场时区
    const marketTime = this.toMarketTime(now, timezone);
    const currentTime = this.formatTime(marketTime);

    // 获取交易时段
    let tradingHours = marketConfig.trading_hours;

    // 美股需要判断夏令时/冬令时
    if (market === 'us') {
      if (this.isDST(now)) {
        tradingHours = marketConfig.trading_hours_summer;
      } else {
        tradingHours = marketConfig.trading_hours_winter;
      }
    }

    if (!tradingHours || tradingHours.length === 0) {
      return false;
    }

    // 检查是否在任一时段内
    for (const period of tradingHours) {
      if (currentTime >= period.start && currentTime < period.end) {
        return true;
      }
    }

    return false;
  }

  /**
   * 判断是否为夏令时 (美国)
   */
  isDST(date = new Date()) {
    // 美国夏令时: 3月第二个周日 - 11月第一个周日
    const year = date.getFullYear();
    const month = date.getMonth();

    // 1月、2月、12月为冬令时
    if (month < 2 || month > 10) {
      return false;
    }

    // 4月-10月为夏令时
    if (month > 2 && month < 10) {
      return true;
    }

    // 3月和11月需要具体判断
    if (month === 2) {
      // 3月第二个周日
      const secondSunday = this.getNthDayOfMonth(year, 2, 0, 2);
      return date.getDate() >= secondSunday;
    } else if (month === 10) {
      // 11月第一个周日
      const firstSunday = this.getNthDayOfMonth(year, 10, 0, 1);
      return date.getDate() < firstSunday;
    }

    return false;
  }

  /**
   * 获取某月第N个星期X
   */
  getNthDayOfMonth(year, month, dayOfWeek, n) {
    const date = new Date(year, month, 1);
    let count = 0;

    while (date.getMonth() === month) {
      if (date.getDay() === dayOfWeek) {
        count++;
        if (count === n) {
          return date.getDate();
        }
      }
      date.setDate(date.getDate() + 1);
    }

    return -1;
  }

  /**
   * 转换为市场时区
   */
  toMarketTime(date, timezone) {
    // 简化处理，实际应该使用时区库
    // 这里我们手动计算时区偏移

    const offset = this.getTimezoneOffset(timezone, date);
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
    return new Date(utc + (offset * 60000));
  }

  /**
   * 获取时区偏移 (小时)
   */
  getTimezoneOffset(timezone, date) {
    const offsets = {
      'Asia/Shanghai': 8,
      'Asia/Hong_Kong': 8,
      'Asia/Seoul': 9,
      'America/New_York': this.getUSOffset(date)
    };

    return offsets[timezone] || 0;
  }

  /**
   * 获取美国时区偏移 (考虑夏令时)
   */
  getUSOffset(date) {
    return this.isDST(date) ? -4 : -5;
  }

  /**
   * 格式化日期
   */
  formatDate(date, market) {
    const marketConfig = this.config.getMarketConfig(market);
    const timezone = marketConfig.timezone || 'Asia/Shanghai';
    const marketDate = this.toMarketTime(date, timezone);

    const year = marketDate.getFullYear();
    const month = String(marketDate.getMonth() + 1).padStart(2, '0');
    const day = String(marketDate.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  /**
   * 格式化时间
   */
  formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}
