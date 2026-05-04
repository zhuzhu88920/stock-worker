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
    if (this.isHoliday(market, now)) return false;
    if (this.isWeekend(market, now)) return false;
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
   * 核心方法：使用 Intl.DateTimeFormat 获取目标时区的精准时间字符串
   * 彻底避免 new Date() 的毫秒运算产生的环境兼容性 Bug
   */
  getMarketTimeParts(date, timezone) {
    const options = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short'
    };
    
    // 生成类似: "10/24/2023, 14:30" (基于 en-US 格式保证稳定解析)
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(date);
    
    const getPart = (type) => {
      const part = parts.find(p => p.type === type);
      return part ? part.value : '';
    };

    // 特殊处理 24:00 的情况（部分环境 en-US 会将 00:00 格式化为 24:00）
    let hour = parseInt(getPart('hour'), 10);
    if (hour === 24) hour = 0;

    return {
      year: getPart('year'),
      month: getPart('month'),
      day: getPart('day'),
      hour: String(hour).padStart(2, '0'),
      minute: getPart('minute'),
      weekday: getPart('weekday') // 返回 Sun, Mon, Tue 等
    };
  }

  /**
   * 判断是否为周末
   */
  isWeekend(market, now = new Date()) {
    const marketConfig = this.config.getMarketConfig(market);
    const timezone = marketConfig.timezone || 'Asia/Shanghai';
    
    // 获取市场时区的具体时间信息
    const parts = this.getMarketTimeParts(now, timezone);
    return parts.weekday === 'Sun' || parts.weekday === 'Sat';
  }

  /**
   * 判断是否在交易时段内
   */
  isInTradingHours(market, now = new Date()) {
    const marketConfig = this.config.getMarketConfig(market);
    const timezone = marketConfig.timezone || 'Asia/Shanghai';

    // 直接获取市场时区的 小时:分钟
    const parts = this.getMarketTimeParts(now, timezone);
    const currentTime = `${parts.hour}:${parts.minute}`;

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
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11

    if (month < 2 || month > 10) return false;
    if (month > 2 && month < 10) return true;

    if (month === 2) { // 3月第二个周日
      const secondSunday = this.getNthDayOfMonth(year, 2, 0, 2);
      return date.getDate() >= secondSunday;
    } else if (month === 10) { // 11月第一个周日
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
        if (count === n) return date.getDate();
      }
      date.setDate(date.getDate() + 1);
    }
    return -1;
  }

  /**
   * 格式化日期 (用于判断节假日)
   */
  formatDate(date, market) {
    const marketConfig = this.config.getMarketConfig(market);
    const timezone = marketConfig.timezone || 'Asia/Shanghai';
    
    const parts = this.getMarketTimeParts(date, timezone);
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
}